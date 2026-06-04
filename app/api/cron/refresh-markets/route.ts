import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateMarkets } from '@/lib/market-generator'
import { scoreMarkets, formatScoringLog } from '@/lib/market-scorer'
import { seedLiquidity, type MarketCategory } from '@/lib/liquidity'
import { CATEGORY_FLOORS } from '@/app/api/cron/release-markets/route'
import { logError, logMessage } from '@/lib/logger'

// Allow up to 60s on Vercel Pro — RSS fetches + Claude Haiku can exceed 10s.
export const maxDuration = 60

// Kill switch: set DISABLE_MARKET_GENERATION=true in Vercel env to stop generation
// without a code deploy. Useful if AI is producing bad markets.
const GENERATION_DISABLED = process.env.DISABLE_MARKET_GENERATION === 'true'

function getAnthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY
}

// Target live market count — must match TARGET_LIVE in release-markets (15/cat × 3 = 45)
const TARGET_LIVE_COUNT = 45
// How many markets to immediately publish from the queue to prime the feed
const PRIME_BATCH_SIZE = 15
// If Sports (live + queued) is below this threshold, bias generation toward Sports
const SPORTS_LOW_THRESHOLD = CATEGORY_FLOORS['Sports'] + 5  // floor(15) + buffer(5) = 20

// Vercel Cron calls this twice daily (06:00 + 18:00 UTC).
// Also callable manually from admin for ad-hoc generation.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Kill switch — disable without a deploy via Vercel env var
  if (GENERATION_DISABLED) {
    logMessage('Market generation skipped: DISABLE_MARKET_GENERATION=true', { context: 'cron:refresh-markets' })
    return NextResponse.json({ skipped: true, reason: 'DISABLE_MARKET_GENERATION is set' })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // ── 1. Check Sports inventory — bias generation if running low ──────────────
  const { data: sportsInventory } = await supabase
    .from('markets')
    .select('id')
    .eq('category', 'Sports')
    .in('status', ['live', 'queued'])
    .eq('resolved', false)

  const sportsTotal = sportsInventory?.length ?? 0
  const sportsHeavy = sportsTotal < SPORTS_LOW_THRESHOLD

  if (sportsHeavy) {
    console.warn(`[refresh-markets] Sports inventory low (${sportsTotal} < ${SPORTS_LOW_THRESHOLD}) — using sports-heavy generation`)
  }

  // ── 2. Generate markets from today's news ────────────────────────────────────
  const anthropicKey = getAnthropicKey()
  let newMarkets: Awaited<ReturnType<typeof generateMarkets>> = []

  try {
    newMarkets = await generateMarkets(anthropicKey, { sportsHeavy })
  } catch (err) {
    logError(err, { context: 'cron:refresh-markets:generate' })
    return NextResponse.json(
      { error: `Market generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  // ── 3. Quality scoring — filter weak markets before inserting ────────────────
  let scoringResult: Awaited<ReturnType<typeof scoreMarkets>>
  try {
    scoringResult = await scoreMarkets(newMarkets, anthropicKey)
    console.log(formatScoringLog(scoringResult))
  } catch (err) {
    console.error('[cron/refresh-markets] Scoring pipeline failed, skipping filter:', err)
    scoringResult = {
      accepted: newMarkets.map((m) => ({ ...m, quality_score: 50 })),
      rejected: [],
      scoring_stats: {
        total_input: newMarkets.length,
        instant_rejected: 0,
        ai_scored: 0,
        ai_accepted: newMarkets.length,
        ai_rejected: 0,
        avg_accepted_score: 50,
      },
    }
  }

  const { accepted: qualityMarkets, rejected: rejectedMarkets, scoring_stats } = scoringResult

  // ── 4a. End-time guard — defense in depth after scoring ─────────────────────
  // Discard any market whose end_time is already past or within 2 hours.
  // The scorer catches this too, but this is a hard server-side gate before DB write.
  const NOW_MS = Date.now()
  const MIN_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours
  const freshMarkets = qualityMarkets.filter((m) => {
    const end = new Date(m.end_time).getTime()
    const hoursLeft = (end - NOW_MS) / 3_600_000
    if (hoursLeft < 2) {
      logMessage(
        `Discarded market with stale end_time: "${m.title}" (${hoursLeft.toFixed(1)}h remaining)`,
        { context: 'cron:refresh-markets:end_time_guard' }
      )
      return false
    }
    return true
  })

  // ── 4. Deduplicate against all existing markets (live + queued) ──────────────
  const { data: existing } = await supabase
    .from('markets')
    .select('title')
    .or('status.eq.live,status.eq.queued,status.is.null')

  const existingTitles = new Set((existing ?? []).map((m) => m.title.toLowerCase()))
  const toQueue = freshMarkets.filter((m) => !existingTitles.has(m.title.toLowerCase()))

  if (toQueue.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No new markets to queue — all generated markets are duplicates.',
      generated: newMarkets.length,
      quality_filter: scoring_stats,
      queued: 0,
      primed: 0,
    })
  }

  // ── 5. Insert markets as QUEUED ──────────────────────────────────────────────
  const toInsert = toQueue.map((m) => {
    const seed = seedLiquidity(m.category as MarketCategory, false, m.starter_probability)
    // Explicitly build insert object — omits starter_probability which is a
    // transient generation field not stored as a DB column (it's encoded in seed).
    return {
      title: m.title,
      category: m.category,
      end_time: m.end_time,
      jackpot_pool: m.jackpot_pool,
      resolution_criteria: m.resolution_criteria,
      resolution_source_url: m.resolution_source_url,
      target_data_key: m.target_data_key,
      ...seed,
      status: 'queued' as const,
      generated_at: now,
      published_at: null,
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError, data: inserted } = await (supabase as any)
    .from('markets')
    .insert(toInsert)
    .select('id, title, category, status')

  if (insertError) {
    logError(new Error(insertError.message), { context: 'cron:refresh-markets:insert' })
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const queuedCount = (inserted ?? []).length

  // ── 6. Prime the feed if below target live count ─────────────────────────────
  // After inserting, check how many live markets exist. If the feed is thin
  // (e.g. first run after migration, or low-traffic period), immediately publish
  // up to PRIME_BATCH_SIZE markets so users don't see an empty feed.
  const { count: liveCount } = await supabase
    .from('markets')
    .select('id', { count: 'exact', head: true })
    .or('status.eq.live,status.is.null')
    .eq('resolved', false)

  let primedCount = 0
  if ((liveCount ?? 0) < TARGET_LIVE_COUNT && queuedCount > 0) {
    const needed = Math.min(
      TARGET_LIVE_COUNT - (liveCount ?? 0),
      PRIME_BATCH_SIZE,
      queuedCount
    )

    // Pick the first N queued markets just inserted (spread across categories)
    const toPublish = (inserted ?? []).slice(0, needed)
    const ids = toPublish.map((m: { id: string }) => m.id)

    if (ids.length > 0) {
      await supabase
        .from('markets')
        .update({ status: 'live', published_at: now })
        .in('id', ids)

      primedCount = ids.length
    }
  }

  return NextResponse.json({
    success: true,
    generation: {
      sports_heavy: sportsHeavy,
      sports_total_before: sportsTotal,
      sports_low_threshold: SPORTS_LOW_THRESHOLD,
    },
    generated: newMarkets.length,
    quality_filter: {
      ...scoring_stats,
      rejected_titles: rejectedMarkets.map((r) => ({
        title: r.market.title,
        score: r.scores.weighted_score.toFixed(1),
        reason: r.reason,
      })),
    },
    queued: queuedCount - primedCount,
    primed: primedCount,
    live_count_before: liveCount ?? 0,
  })
}
