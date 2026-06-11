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
import { logError, logMessage } from '@/lib/logger'
import Anthropic from '@anthropic-ai/sdk'

// Allow up to 60 s — resolving many markets with Claude fallbacks can be slow.
export const maxDuration = 60

// Kill switch: set DISABLE_RESOLUTION=true in Vercel env to halt automated resolution.
// Use this if resolution is producing wrong outcomes and manual review is needed.
const RESOLUTION_DISABLED = process.env.DISABLE_RESOLUTION === 'true'

// ── Anthropic key helper ─────────────────────────────────────────────────────

function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY
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

    // Track loss streak for comeback mechanics + send loss notification
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
        } else {
          // Regular loss notification — gives users a reason to come back and bet again
          void pushToUser(bet.user_id, {
            title: '📉 Market Settled',
            body: `"${market.title.length > 50 ? market.title.slice(0, 47) + '…' : market.title}" didn't go your way. Jump back in.`,
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

/**
 * Void a market and REFUND every stake.
 *
 * Used when neither the trusted source nor the AI fallback could verify the
 * outcome. We deliberately do NOT guess from the crowd (yes_percent) — a market
 * must never pay out based on who pumped it. Everyone gets their stake back; the
 * bet is neither a win nor a loss (won stays null, payout set to the refunded
 * amount). The market's winner=null is the canonical "voided" signal.
 */
async function voidBets(
  supabase: ReturnType<typeof createAdminClient>,
  market: { id: string; title: string }
): Promise<number> {
  const { data: bets } = await supabase
    .from('bets')
    .select('*')
    .eq('market_id', market.id)
    .is('won', null)

  let refundCount = 0
  for (const bet of bets ?? []) {
    // Record the refund amount on the bet (won stays null = neither win nor loss).
    await supabase.from('bets').update({ payout: bet.amount }).eq('id', bet.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', bet.user_id)
      .single()

    if (profile) {
      await supabase
        .from('profiles')
        .update({ credits: profile.credits + bet.amount })
        .eq('id', bet.user_id)

      void pushToUser(bet.user_id, {
        title: '↩️ Market Voided — Refunded',
        body: `"${market.title.length > 47 ? market.title.slice(0, 47) + '…' : market.title}" couldn't be settled. Your ${Number(bet.amount).toLocaleString()} CR is back.`,
        url: '/',
      })
      refundCount++
    }
  }
  return refundCount
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

  // Kill switch — halt resolution without a deploy
  if (RESOLUTION_DISABLED) {
    logMessage('Resolution skipped: DISABLE_RESOLUTION=true', { context: 'resolve-expired' })
    return NextResponse.json({ skipped: true, reason: 'DISABLE_RESOLUTION is set' })
  }

  // 1. Fetch only expired, unresolved markets (hits partial index)
  const { data: expiredMarkets, error } = await supabase
    .from('markets')
    .select('*')
    .eq('resolved', false)
    .lte('end_time', new Date().toISOString())

  if (error) {
    logError(new Error(error.message), { context: 'resolve-expired:fetch' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!expiredMarkets?.length) {
    return NextResponse.json({ resolved: 0, message: 'No expired markets' })
  }

  const apiKey = getAnthropicKey()
  const results = []

  const errors: { marketId: string; error: string }[] = []

  for (const market of expiredMarkets) {
    try {
      // Determine the outcome from real data first, AI second, and VOID third.
      // There is no crowd-vote fallback: an unverifiable market is voided and
      // refunded, never settled on who believed what.
      let outcome: 'yes' | 'no' | 'void' = 'void'
      let resolvedBy = 'voided_unverifiable'

      // 2. Try direct HTTP resolution first (no AI tokens)
      const directOutcome = await resolveFromSource(
        market.resolution_source_url,
        market.target_data_key
      )

      if (directOutcome !== 'unknown') {
        outcome = directOutcome
        resolvedBy = 'direct_http'
      } else if (apiKey) {
        // 3. Claude fallback — only invoked when direct resolution fails
        const aiOutcome = await resolveWithClaude(
          market.title,
          market.resolution_criteria,
          apiKey
        )
        if (aiOutcome !== 'unknown') {
          outcome = aiOutcome
          resolvedBy = 'ai_fallback'
        }
      }

      if (outcome === 'void') {
        // 4a. VOID — couldn't verify from a trusted source or AI. Refund all
        // stakes; winner=null is the canonical voided marker.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('markets')
          .update({
            resolved: true,
            winner: null,
            hot_score: 0,
            momentum_shift: 0,
            resolved_at: new Date().toISOString(),
            resolution_note: 'Voided — outcome could not be verified from a trusted source. All stakes refunded.',
          })
          .eq('id', market.id)

        const refundCount = await voidBets(supabase, market)

        results.push({
          marketId: market.id,
          title: market.title,
          winner: null,
          resolvedBy,
          voided: true,
          refundCount,
        })
      } else {
        // 4b. Settle normally on the verified outcome
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('markets')
          .update({ resolved: true, winner: outcome, hot_score: 0, momentum_shift: 0, resolved_at: new Date().toISOString() })
          .eq('id', market.id)

        const payoutCount = await settleBets(supabase, market, outcome)

        results.push({
          marketId: market.id,
          title: market.title,
          winner: outcome,
          resolvedBy,
          payoutCount,
        })
      }
    } catch (err) {
      // Log per-market failure to Sentry but continue resolving other markets
      logError(err, { context: 'resolve-expired:market', marketId: market.id, title: market.title })
      errors.push({ marketId: market.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (errors.length > 0) {
    console.error(`[resolve-expired] ${errors.length} market(s) failed to resolve:`, errors)
  }

  return NextResponse.json({ resolved: results.length, results, errors })
}
