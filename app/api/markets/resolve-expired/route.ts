/**
 * POST /api/markets/resolve-expired
 *
 * Resolution pipeline (in order):
 *  1. Query DB for markets where resolved=false AND end_time <= now()
 *     (leverages partial index idx_markets_unresolved_expired)
 *  2. Direct HTTP GET to resolution_source_url, extract outcome from target_data_key
 *  3. Claude Haiku ONLY as fallback when direct resolution returns 'unknown'
 *  4. Final fallback: majority vote (yes_percent >= 50)
 */

import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  COMEBACK_XP_BONUS,
  COMEBACK_LOSS_TRIGGER,
} from '@/lib/game-engine'
import { resolveFromSource } from '@/lib/market-resolver'
import { pushToUser } from '@/lib/push'
import { readFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'

// Allow up to 60 s — resolving many markets with Claude fallbacks can be slow.
export const maxDuration = 60

// ── Anthropic key helper (same pattern as cron route) ────────────────────────

function getAnthropicKey(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY
  if (fromEnv) return fromEnv
  try {
    const content = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    return content.match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim()
  } catch {
    return undefined
  }
}

// ── Claude fallback ──────────────────────────────────────────────────────────

// Word-boundary patterns prevent "UNKNOWN" from matching "NO"
const YES_PATTERN = /\bYES\b/
const NO_PATTERN = /\bNO\b/

async function resolveWithClaude(
  title: string,
  resolutionCriteria: string | null,
  apiKey: string
): Promise<'yes' | 'no' | 'unknown'> {
  const client = new Anthropic({ apiKey })

  // Prompt is deliberately strict: single token response, no preamble allowed.
  const prompt = `Resolve this prediction market.

Market: "${title}"
Resolution criteria: ${resolutionCriteria ?? 'Use your best judgment based on the market title.'}

Your response MUST be exactly one word — nothing else:
- YES  (market resolved in favour of the YES outcome)
- NO   (market resolved in favour of the NO outcome)
- UNKNOWN  (you cannot determine the outcome with confidence)

Do not write any other words, punctuation, or explanation. One word only.`

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (
      message.content[0].type === 'text' ? message.content[0].text : ''
    ).trim().toUpperCase()

    // Use word-boundary regex so "UNKNOWN" never matches \bNO\b
    if (YES_PATTERN.test(text)) return 'yes'
    if (NO_PATTERN.test(text)) return 'no'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// ── Payout helpers ───────────────────────────────────────────────────────────

async function settleBets(
  supabase: ReturnType<typeof createAdminClient>,
  market: { id: string; title: string; yes_percent: number },
  winner: 'yes' | 'no'
): Promise<number> {
  const { data: bets } = await supabase
    .from('bets')
    .select('*')
    .eq('market_id', market.id)
    .is('won', null)

  let payoutCount = 0

  for (const bet of bets ?? []) {
    const won = bet.side === winner
    // Fixed-odds payout was locked at bet time and stored on the bet record.
    // Winners receive their locked payout. Losers receive 0.
    const payout = won ? (bet.payout ?? 0) : 0

    await supabase.from('bets').update({ won, payout }).eq('id', bet.id)

    // Track loss streak for comeback mechanics
    if (!won) {
      const { data: losingProfile } = await supabase
        .from('profiles')
        .select('loss_streak')
        .eq('id', bet.user_id)
        .single()

      if (losingProfile) {
        const newLossStreak = (losingProfile.loss_streak ?? 0) + 1
        await supabase
          .from('profiles')
          .update({
            loss_streak: newLossStreak,
            comeback_eligible: newLossStreak >= COMEBACK_LOSS_TRIGGER,
          })
          .eq('id', bet.user_id)

        if (newLossStreak === COMEBACK_LOSS_TRIGGER) {
          void pushToUser(bet.user_id, {
            title: '🔥 Comeback Mode Activated',
            body: 'Win your next bet for BONUS XP. You\'ve got this.',
            url: '/',
          })
        }
      }
    }

    if (won && payout > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits, xp, comeback_eligible')
        .eq('id', bet.user_id)
        .single()

      if (profile) {
        // Comeback bonus — extra XP when winning after a loss streak
        const isComeback = (profile as { comeback_eligible?: boolean }).comeback_eligible === true
        const bonusXP = isComeback ? COMEBACK_XP_BONUS : 0

        await supabase
          .from('profiles')
          .update({
            credits: profile.credits + payout,
            xp: profile.xp + 60 + bonusXP,
            loss_streak: 0,
            comeback_eligible: false,
          })
          .eq('id', bet.user_id)

        const profit = payout - bet.amount
        const profitStr = profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()

        void pushToUser(bet.user_id, {
          title: isComeback ? '⚡ COMEBACK WIN!' : '💰 Market Settled — You Won!',
          body: isComeback
            ? `Comeback Kid! ${profitStr} CR + bonus XP on "${market.title}"`
            : `${profitStr} CR profit on "${market.title}"`,
          url: '/',
        })

        payoutCount++
      }
    }
  }

  return payoutCount
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const supabase = createAdminClient()

  // Auth: allow cron secret OR authenticated user
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const userClient = await import('@/lib/supabase/server').then((m) => m.createClient())
    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Fetch only expired, unresolved markets (hits partial index)
  const { data: expiredMarkets, error } = await supabase
    .from('markets')
    .select('*')
    .eq('resolved', false)
    .lte('end_time', new Date().toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!expiredMarkets?.length) {
    return NextResponse.json({ resolved: 0, message: 'No expired markets' })
  }

  const apiKey = getAnthropicKey()
  const results = []

  for (const market of expiredMarkets) {
    let winner: 'yes' | 'no' = market.yes_percent >= 50 ? 'yes' : 'no'
    let resolvedBy = 'majority_vote'

    // 2. Try direct HTTP resolution first (no AI tokens)
    const directOutcome = await resolveFromSource(
      market.resolution_source_url,
      market.target_data_key
    )

    if (directOutcome !== 'unknown') {
      winner = directOutcome
      resolvedBy = 'direct_http'
    } else if (apiKey) {
      // 3. Claude fallback — only invoked when direct resolution fails
      const aiOutcome = await resolveWithClaude(
        market.title,
        market.resolution_criteria,
        apiKey
      )
      if (aiOutcome !== 'unknown') {
        winner = aiOutcome
        resolvedBy = 'ai_fallback'
      }
    }

    // 4. Persist resolution — clear engagement signals on close
    await supabase
      .from('markets')
      .update({ resolved: true, winner, hot_score: 0, momentum_shift: 0 })
      .eq('id', market.id)

    const payoutCount = await settleBets(supabase, market, winner)

    results.push({
      marketId: market.id,
      title: market.title,
      winner,
      resolvedBy,
      payoutCount,
    })
  }

  return NextResponse.json({ resolved: results.length, results })
}
