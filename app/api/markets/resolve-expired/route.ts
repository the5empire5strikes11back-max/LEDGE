/**
 * POST /api/markets/resolve-expired
 *
 * Resolution pipeline (in order):
 *  1. Query DB for markets where resolved=false AND end_time <= now()
 *     (leverages partial index idx_markets_unresolved_expired)
 *  2. Direct HTTP GET to resolution_source_url, extract outcome from target_data_key
 *  3. Claude Haiku ONLY as fallback when direct resolution returns 'unknown'
 *  4. Still unverifiable? Distinguish "result not in yet" from "unresolvable":
 *       • within VOID_GRACE_HOURS of close → leave PENDING, retry next pass
 *         (handles slow / delayed official results — don't void a coming answer)
 *       • past the grace window → VOID + refund all stakes (winner=null)
 *     There is NO crowd-vote fallback — unverifiable markets are never settled
 *     on who believed what.
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
import { readFileSync } from 'fs'
import { join } from 'path'

// Allow up to 60 s — resolving many markets with Claude fallbacks can be slow.
export const maxDuration = 60

// Kill switch: set DISABLE_RESOLUTION=true in Vercel env to halt automated resolution.
// Use this if resolution is producing wrong outcomes and manual review is needed.
const RESOLUTION_DISABLED = process.env.DISABLE_RESOLUTION === 'true'

const HOUR_MS = 3_600_000
// How long a closed-but-unverifiable market stays PENDING (retried each cron
// pass) before it's voided + refunded. Covers slow/late official results so a
// genuine answer that posts an hour after close settles instead of voiding.
const VOID_GRACE_HOURS = 24

// ── Anthropic key helper ─────────────────────────────────────────────────────

function getAnthropicKey(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY
  if (fromEnv) return fromEnv
  // Claude Code injects ANTHROPIC_API_KEY="" into subprocesses, overriding
  // .env.local — read the file directly as a fallback (same as refresh-markets).
  try {
    const envPath = join(process.cwd(), '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    return content.match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1]?.trim() ?? undefined
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

/**
 * Pick the single winning option of an exclusive group (Multiple Choice / Numeric
 * / Date). Returns the winning option's market id, or 'unknown'. Resolving at the
 * group level guarantees exactly one YES — letting options resolve independently
 * could yield two winners.
 */
async function resolveGroupWinner(
  groupLabel: string,
  options: { id: string; label: string }[],
  apiKey: string
): Promise<string | 'unknown'> {
  const client = new Anthropic({ apiKey })
  const prompt = `A multiple-choice prediction question: "${groupLabel}"

Options:
${options.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}

Exactly one option is the correct, settled outcome. Respond with ONLY the number
of the winning option (e.g. "3"). If the event has not concluded or you cannot
determine the winner with confidence, respond with ONLY "UNKNOWN". No other text.`

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (message.content[0].type === 'text' ? message.content[0].text : '').trim()
    const m = text.match(/\d+/)
    if (!m) return 'unknown'
    const idx = parseInt(m[0], 10) - 1
    if (idx < 0 || idx >= options.length) return 'unknown'
    return options[idx].id
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
  const nowMs = Date.now()
  const results = []

  const errors: { marketId: string; error: string }[] = []

  // ── Exclusive groups (Multiple Choice / Numeric / Date) ────────────────────
  // Resolve at the group level so exactly one option wins. Standalone markets and
  // Set (independent) options fall through to the per-market loop below.
  const handledIds = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exclusiveGroups = new Map<string, any[]>()
  for (const raw of expiredMarkets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = raw as any
    if (m.group_id && m.group_exclusive) {
      const arr = exclusiveGroups.get(m.group_id) ?? []
      arr.push(m)
      exclusiveGroups.set(m.group_id, arr)
    }
  }

  for (const [groupId, opts] of exclusiveGroups) {
    try {
      const winnerId = apiKey
        ? await resolveGroupWinner(opts[0].group_label ?? opts[0].title, opts.map((o) => ({ id: o.id, label: o.option_label ?? o.title })), apiKey)
        : 'unknown'

      if (winnerId !== 'unknown') {
        for (const o of opts) {
          const w: 'yes' | 'no' = o.id === winnerId ? 'yes' : 'no'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('markets').update({
            resolved: true, winner: w, hot_score: 0, momentum_shift: 0,
            resolved_at: new Date().toISOString(),
          }).eq('id', o.id)
          const payoutCount = await settleBets(supabase, o, w)
          results.push({ marketId: o.id, group_id: groupId, winner: w, resolvedBy: 'group_ai', payoutCount })
          handledIds.add(o.id)
        }
      } else {
        // Grace window for the whole group — same as standalone markets.
        const hoursSinceClose = (nowMs - new Date(opts[0].end_time).getTime()) / HOUR_MS
        for (const o of opts) {
          if (hoursSinceClose < VOID_GRACE_HOURS) {
            results.push({ marketId: o.id, group_id: groupId, pending: true })
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from('markets').update({
              resolved: true, winner: null, hot_score: 0, momentum_shift: 0,
              resolved_at: new Date().toISOString(),
              resolution_note: 'Voided — winner could not be determined. All stakes refunded.',
            }).eq('id', o.id)
            const refundCount = await voidBets(supabase, o)
            results.push({ marketId: o.id, group_id: groupId, voided: true, refundCount })
          }
          handledIds.add(o.id)
        }
      }
    } catch (err) {
      logError(err, { context: 'resolve-expired:group', groupId })
      for (const o of opts) handledIds.add(o.id) // skip in the per-market loop; retry next pass
    }
  }

  for (const market of expiredMarkets) {
    if (handledIds.has(market.id)) continue
    // Polls aren't bet on — they just close. Mark resolved, no settlement.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((market as any).group_type === 'poll') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('markets').update({ resolved: true, winner: null, resolved_at: new Date().toISOString() }).eq('id', market.id)
      continue
    }
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
        // Grace window: a result that simply hasn't posted yet shouldn't be
        // voided. Leave the market PENDING (still resolved=false) so a later
        // cron pass can settle it once the source reports; only fall through to
        // void once it's been unverifiable for VOID_GRACE_HOURS past close.
        const hoursSinceClose = (nowMs - new Date(market.end_time).getTime()) / HOUR_MS
        if (hoursSinceClose < VOID_GRACE_HOURS) {
          results.push({
            marketId: market.id,
            title: market.title,
            pending: true,
            hoursSinceClose: Math.round(hoursSinceClose * 10) / 10,
          })
          continue
        }

        // 4a. VOID — still unverifiable past the grace window. Refund all
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

  const pending = results.filter((r) => (r as { pending?: boolean }).pending).length
  return NextResponse.json({ resolved: results.length - pending, pending, results, errors })
}
