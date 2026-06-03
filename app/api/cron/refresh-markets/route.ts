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

// Target live market count — if below this we seed from queue immediately
const TARGET_LIVE_COUNT = 16
// How many markets to immediately publish from the queue to prime the feed
const PRIME_BATCH_SIZE = 5
// If Sports (live + queued) is below this threshold, bias generation toward Sports
const SPORTS_LOW_THRESHOLD = CATEGORY_FLOORS['Sports'] + 3  // floor(5) + buffer(3) = 8

// ── Schema capability detection ───────────────────────────────────────────────
// The production DB may be on a pre-migration schema that lacks the status,
// generated_at, and published_at columns. We detect this once per invocation
// and fall back to a simpler insert that works with the legacy schema.
async function detectSchemaCapabilities(supabase: ReturnType<typeof createAdminClient>): Promise<{
  hasStatusColumn: boolean
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('markets')
    .select('id, status')
    .limit(1)
  return { hasStatusColumn: !error }
}

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

  // Detect whether the production DB has the full schema (status column etc.)
  const { hasStatusColumn } = await detectSchemaCapabilities(supabase)
  if (!hasStatusColumn) {
    logMessage('Running in legacy schema mode — status column not found. Markets will be inserted as live immediately.', { context: 'cron:refresh-markets' })
  }

  // ── 1. Check Sports inventory — bias generation if running low ──────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sportsQuery = hasStatusColumn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (supabase as any).from('markets').select('id').eq('category', 'Sports').in('status', ['live', 'queued']).eq('resolved', false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (supabase as any).from('markets').select('id').eq('category', 'Sports').eq('resolved', false).gt('end_time', now)

  const { data: sportsInventory } = await sportsQuery

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dedupQuery = hasStatusColumn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (supabase as any).from('markets').select('title').or('status.eq.live,status.eq.queued,status.is.null')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (supabase as any).from('markets').select('title').eq('resolved', false)

  const { data: existing } = await dedupQuery

  const existingTitles = new Set((existing ?? []).map((m: { title: string }) => m.title.toLowerCase()))
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

  // ── 5. Insert markets ────────────────────────────────────────────────────────
  // With full schema: insert as 'queued' for controlled release via release-markets.
  // Legacy schema (no status column): insert bare — markets show as live immediately
  // since the feed filter treats status=null as live.
  const toInsert = toQueue.map((m) => {
    const seed = seedLiquidity(m.category as MarketCategory, false)
    if (hasStatusColumn) {
      return {
        ...m,
        ...seed,
        status: 'queued' as const,
        generated_at: now,
        published_at: null,
      }
    }
    // Legacy schema — omit status/generated_at/published_at
    return { ...m, ...seed }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectCols = hasStatusColumn ? 'id, title, category, status' : 'id, title, category'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError, data: inserted } = await (supabase as any)
    .from('markets')
    .insert(toInsert)
    .select(selectCols)

  if (insertError) {
    logError(new Error(insertError.message), { context: 'cron:refresh-markets:insert' })
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const insertedCount = (inserted ?? []).length

  // ── 6. Prime the feed (full schema only) ─────────────────────────────────────
  // In legacy mode markets are already live on insert, so no priming needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liveCountQuery = hasStatusColumn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (supabase as any).from('markets').select('id', { count: 'exact', head: true }).or('status.eq.live,status.is.null').eq('resolved', false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (supabase as any).from('markets').select('id', { count: 'exact', head: true }).eq('resolved', false).gt('end_time', now)

  const { count: liveCount } = await liveCountQuery

  let primedCount = 0
  if (hasStatusColumn && (liveCount ?? 0) < TARGET_LIVE_COUNT && insertedCount > 0) {
    const needed = Math.min(
      TARGET_LIVE_COUNT - (liveCount ?? 0),
      PRIME_BATCH_SIZE,
      insertedCount
    )
    const toPublish = (inserted ?? []).slice(0, needed)
    const ids = toPublish.map((m: { id: string }) => m.id)

    if (ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('markets')
        .update({ status: 'live', published_at: now })
        .in('id', ids)
      primedCount = ids.length
    }
  }

  const queuedCount = hasStatusColumn ? insertedCount - primedCount : 0

  return NextResponse.json({
    success: true,
    schema_mode: hasStatusColumn ? 'full' : 'legacy',
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
    inserted: insertedCount,
    queued: queuedCount,
    primed: primedCount,
    live_count_before: liveCount ?? 0,
  })
}
