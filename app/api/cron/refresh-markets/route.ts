import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateMarkets, type GeneratedMarket } from '@/lib/market-generator'
import { fetchUpcomingEspnMarkets } from '@/lib/espn-schedule'
import { scoreMarkets, formatScoringLog } from '@/lib/market-scorer'
import { screenCandidate } from '@/lib/market-pipeline'
import { marketSignature, type MarketSignature } from '@/lib/market-dedup'
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

// Target live market count — must match TARGET_LIVE in release-markets (15/cat × 6 = 90)
const TARGET_LIVE_COUNT = 90
// How many markets to immediately publish from the queue to prime the feed
const PRIME_BATCH_SIZE = 15

// Vercel Cron calls this once daily (12:00 UTC); release-markets self-heals
// floor deficits between runs. Also callable manually for ad-hoc generation.
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

  // ── 1. Per-category inventory — target generation at the floor deficits ──────
  // Count live + queued (non-resolved) per category. A category's "deficit" is
  // how far its inventory sits below the 15-market floor; we ask the generator
  // to produce that many (×over-gen buffer to survive pipeline rejection), so
  // every category — Sports, Culture, Politics, Tech, Viral, Wild — is driven
  // toward 15. Queued markets count, since release-markets will promote them.
  const { data: inventory } = await supabase
    .from('markets')
    .select('category')
    .in('status', ['live', 'queued'])
    .eq('resolved', false)

  const invCounts = new Map<string, number>()
  for (const r of inventory ?? []) {
    invCounts.set(r.category, (invCounts.get(r.category) ?? 0) + 1)
  }

  // Over-generate vs raw deficit because the editorial pipeline rejects a large
  // share (stale, dup, overflow). Generating ~1.7× the gap keeps floors filling.
  const OVER_GEN = 1.7
  const categoryTargets: Record<string, number> = {}
  let totalDeficit = 0
  for (const [cat, floor] of Object.entries(CATEGORY_FLOORS)) {
    const deficit = Math.max(0, floor - (invCounts.get(cat) ?? 0))
    totalDeficit += deficit
    if (deficit > 0) categoryTargets[cat] = Math.ceil(deficit * OVER_GEN)
  }

  // ── 1b. Sports backbone: seed from REAL ESPN games (guaranteed resolvable) ───
  // The model is bad at guessing which teams actually play; pull live upcoming
  // games from ESPN and let those BE the Sports markets. They resolve cleanly off
  // the box score. Zero out the AI's Sports target so it focuses elsewhere.
  let espnMarkets: GeneratedMarket[] = []
  const sportsTarget = categoryTargets['Sports'] ?? 0
  if (sportsTarget > 0) {
    try {
      espnMarkets = await fetchUpcomingEspnMarkets(sportsTarget)
    } catch (err) {
      logError(err, { context: 'cron:refresh-markets:espn-seed' })
    }
    const remaining = Math.max(0, sportsTarget - espnMarkets.length)
    if (remaining > 0) categoryTargets['Sports'] = remaining
    else delete categoryTargets['Sports']
  }

  // When every category is already stocked, still rotate in a light fresh batch.
  const useTargets = totalDeficit > 0
  const totalTarget = useTargets && Object.keys(categoryTargets).length > 0
    ? Math.max(20, Math.min(60, Object.values(categoryTargets).reduce((a, b) => a + b, 0)))
    : 12

  logMessage(
    `[refresh-markets] inventory ${JSON.stringify(Object.fromEntries(invCounts))} — ` +
      `deficits ${JSON.stringify(categoryTargets)} — requesting ${totalTarget}`,
    { context: 'cron:refresh-markets:targeting' }
  )

  // ── 2. Generate markets, focused on the categories below floor ───────────────
  const anthropicKey = getAnthropicKey()
  let newMarkets: Awaited<ReturnType<typeof generateMarkets>> = []

  try {
    newMarkets = await generateMarkets(anthropicKey, {
      categoryTargets: useTargets ? categoryTargets : undefined,
      totalTarget,
    })
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

  // ── 4. Editorial pipeline gate (lib/market-pipeline) ─────────────────────────
  // Every candidate passes ONE unified gate, in order: temporal freshness /
  // exact-countdown / resolvability → content quality & safety → lexical +
  // semantic de-duplication → per-category hard ceiling. Each rejection carries
  // an explicit status (past_event, stale, countdown_mismatch, duplicate,
  // category_overflow, …). Accumulators are fed back in so candidates are
  // screened against the batch-so-far, not just the database.
  const NOW_MS = Date.now()

  const { data: existing } = await supabase
    .from('markets')
    .select('title, category, status, resolved')
    .or('status.eq.live,status.eq.queued,status.is.null')

  const seenTitles: string[] = (existing ?? []).map((m) => m.title)

  // Live (non-resolved) market count per category — drives the ceiling check.
  const liveCounts = new Map<string, number>()
  for (const m of existing ?? []) {
    const live = (m.status === 'live' || m.status == null) && !m.resolved
    if (live) liveCounts.set(m.category, (liveCounts.get(m.category) ?? 0) + 1)
  }

  // Seed semantic signatures from existing titles so the batch dedups against
  // what's already on the feed, not just against itself.
  const acceptedSignatures: MarketSignature[] = []
  for (const t of seenTitles) {
    const sig = marketSignature(t)
    if (sig) acceptedSignatures.push(sig)
  }

  // Screen the ESPN-seeded sports markets FIRST (they're guaranteed resolvable),
  // then the AI-generated markets. Both pass through the identical gate.
  const candidates: GeneratedMarket[] = [...espnMarkets, ...qualityMarkets]
  const toQueue: GeneratedMarket[] = []
  const screenedOut: Array<{ title: string; status: string; reason: string | null }> = []

  for (const m of candidates) {
    const result = screenCandidate(
      {
        title: m.title,
        category: m.category,
        endTimeIso: m.end_time,
        resolutionCriteria: m.resolution_criteria,
        resolutionSourceUrl: m.resolution_source_url,
        targetDataKey: m.target_data_key,
      },
      { existingTitles: seenTitles, acceptedSignatures, liveCounts, nowMs: NOW_MS }
    )
    if (!result.ok) {
      screenedOut.push({ title: m.title, status: result.status, reason: result.reason })
      continue
    }
    toQueue.push(m)
    seenTitles.push(m.title)
    if (result.signature) acceptedSignatures.push(result.signature)
    // Count the about-to-publish market toward its category ceiling so a single
    // batch can never blow past the cap.
    liveCounts.set(m.category, (liveCounts.get(m.category) ?? 0) + 1)
  }

  if (screenedOut.length > 0) {
    // Tally rejections by status for an at-a-glance editorial log.
    const byStatus = screenedOut.reduce<Record<string, number>>((acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1
      return acc
    }, {})
    logMessage(
      `[refresh-markets] pipeline dropped ${screenedOut.length}/${candidates.length} (${espnMarkets.length} espn-seeded) ` +
        `(${Object.entries(byStatus).map(([k, v]) => `${k}:${v}`).join(' ')}): ` +
        screenedOut.map((s) => `[${s.status}] ${s.title.slice(0, 48)}`).join(' · '),
      { context: 'cron:refresh-markets:pipeline' }
    )
  }

  if (toQueue.length === 0) {
    return NextResponse.json({
      success: true,
      message: 'No new markets to queue — all candidates were stale, duplicate, low quality, or over category ceiling.',
      generated: newMarkets.length,
      quality_filter: scoring_stats,
      screened_out: screenedOut.length,
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
      inventory: Object.fromEntries(invCounts),
      category_targets: categoryTargets,
      total_requested: totalTarget,
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
