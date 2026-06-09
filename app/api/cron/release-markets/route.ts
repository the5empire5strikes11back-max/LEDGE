import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const maxDuration = 30

/**
 * Minimum hours between release cycles when triggered by a client request.
 * Cron-triggered calls always run regardless of this limit.
 */
const CLIENT_RATE_LIMIT_HOURS = 2

// ── Feed count targets ────────────────────────────────────────────────────────
// 15 markets per category × 6 categories = 90 total target

const TARGET_LIVE = 90
const MIN_LIVE = 60
const RELEASE_BATCH_NORMAL = 6
const RELEASE_BATCH_EMERGENCY = 12
/** Always release at least this many even when feed is at target (freshness signal) */
const RELEASE_MIN_ROLLING = 2
const ARCHIVE_RESOLVED_AFTER_DAYS = 5
const ARCHIVE_STALE_QUEUED_AFTER_DAYS = 4

// ── Category floor targets ─────────────────────────────────────────────────
// 15 live non-resolved markets per category at all times.
// Fill these before any variety/freshness selection.

export const CATEGORY_FLOORS: Record<string, number> = {
  Sports:   15,
  Culture:  15,
  Politics: 15,
  Tech:     15,
  Viral:    15,
  Wild:     15,
}

// ── Category health types (also exported for the debug endpoint) ──────────────

export interface CategoryHealthEntry {
  live: number
  queued: number
  floor: number
  deficit: number      // floor - live (0 if above floor)
  starved: boolean     // live < floor
  queue_sufficient: boolean  // queued >= deficit
}

export interface CategoryHealthReport {
  by_category: Record<string, CategoryHealthEntry>
  starvation_warnings: string[]   // categories currently below floor
  emergency_warnings: string[]    // categories with floor deficit AND insufficient queue
  sports_total: number            // live + queued Sports (used for generation bias)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60_000).toISOString()
}

function urgencyScore(endTime: string): number {
  const hoursLeft = Math.max(0, (new Date(endTime).getTime() - Date.now()) / 3_600_000)
  if (hoursLeft < 12) return 1.0
  if (hoursLeft < 24) return 0.85
  if (hoursLeft < 48) return 0.65
  if (hoursLeft < 96) return 0.35
  return 0.15
}

// ── Category health snapshot ─────────────────────────────────────────────────

export function buildHealthReport(
  liveCounts: Map<string, number>,
  queuedCounts: Map<string, number>
): CategoryHealthReport {
  const allCategories = new Set([
    ...Object.keys(CATEGORY_FLOORS),
    ...liveCounts.keys(),
    ...queuedCounts.keys(),
  ])

  const byCategory: Record<string, CategoryHealthEntry> = {}
  const starvationWarnings: string[] = []
  const emergencyWarnings: string[] = []

  for (const cat of allCategories) {
    const live = liveCounts.get(cat) ?? 0
    const queued = queuedCounts.get(cat) ?? 0
    const floor = CATEGORY_FLOORS[cat] ?? 0
    const deficit = Math.max(0, floor - live)
    const starved = live < floor

    byCategory[cat] = {
      live,
      queued,
      floor,
      deficit,
      starved,
      queue_sufficient: queued >= deficit,
    }

    if (starved) starvationWarnings.push(cat)
    if (starved && queued < deficit) emergencyWarnings.push(cat)
  }

  const sportsTotal = (liveCounts.get('Sports') ?? 0) + (queuedCounts.get('Sports') ?? 0)

  return {
    by_category: byCategory,
    starvation_warnings: starvationWarnings,
    emergency_warnings: emergencyWarnings,
    sports_total: sportsTotal,
  }
}

// ── Floor-priority market selection ──────────────────────────────────────────
//
// Two-pass algorithm:
//   Pass 1 — Floor fill: pick markets from starved categories in deficit order,
//             using urgency as the tiebreaker within each category.
//   Pass 2 — Variety fill: from the remaining queue, score by under-representation
//             × urgency (same as original logic).

type QueuedEntry = { id: string; category: string; end_time: string }

function selectWithFloorPriority(
  queued: QueuedEntry[],
  liveCounts: Map<string, number>,
  count: number
): string[] {
  const selected: string[] = []
  const usedIds = new Set<string>()

  // ── Pass 1: fill floors (largest deficit first) ──────────────────────────
  const starvedCategories = Object.entries(CATEGORY_FLOORS)
    .map(([cat, floor]) => ({ cat, floor, deficit: Math.max(0, floor - (liveCounts.get(cat) ?? 0)) }))
    .filter((x) => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)

  for (const { cat, deficit } of starvedCategories) {
    if (selected.length >= count) break

    const candidates = queued
      .filter((m) => m.category === cat && !usedIds.has(m.id))
      .sort((a, b) => urgencyScore(b.end_time) - urgencyScore(a.end_time))

    const slots = Math.min(deficit, count - selected.length)
    for (const m of candidates.slice(0, slots)) {
      selected.push(m.id)
      usedIds.add(m.id)
    }
  }

  if (selected.length >= count) return selected

  // ── Pass 2: variety + urgency fill for remaining slots ───────────────────
  const remaining = queued.filter((m) => !usedIds.has(m.id))
  const totalLive = [...liveCounts.values()].reduce((a, b) => a + b, 0)

  const scored = remaining.map((m) => {
    const liveShare = totalLive > 0 ? (liveCounts.get(m.category) ?? 0) / totalLive : 0
    const variety = 1 - liveShare
    const urgency = urgencyScore(m.end_time)
    return { id: m.id, score: variety * 0.55 + urgency * 0.45 }
  })

  scored.sort((a, b) => b.score - a.score)
  for (const m of scored.slice(0, count - selected.length)) {
    selected.push(m.id)
  }

  return selected
}

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`

  const supabase = createAdminClient()

  // Allow authenticated users for soft-trigger (same pattern as resolve-expired)
  if (!isCron) {
    const userClient = await import('@/lib/supabase/server').then((m) => m.createClient())
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Rate-limit client calls — skip if last publish < CLIENT_RATE_LIMIT_HOURS ago
    const { data: latestPublish } = await supabase
      .from('markets')
      .select('published_at')
      .eq('status', 'live')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestPublish?.published_at) {
      const hoursSince = (Date.now() - new Date(latestPublish.published_at).getTime()) / 3_600_000
      if (hoursSince < CLIENT_RATE_LIMIT_HOURS) {
        return NextResponse.json({
          skipped: true,
          reason: `Last release ${hoursSince.toFixed(1)}h ago — next in ${(CLIENT_RATE_LIMIT_HOURS - hoursSince).toFixed(1)}h`,
        })
      }
    }
  }

  const now = new Date().toISOString()

  // ── 1. Snapshot live + queued state ──────────────────────────────────────────
  // Only fetch queued markets whose end_time is still at least 2h away —
  // anything closer is expired before it even goes live.
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60_000).toISOString()

  const [liveResult, queuedResult] = await Promise.all([
    supabase
      .from('markets')
      .select('id, category')
      .or('status.eq.live,status.is.null')
      .eq('resolved', false),
    supabase
      .from('markets')
      .select('id, category, end_time, generated_at')
      .eq('status', 'queued')
      .gt('end_time', twoHoursFromNow)
      .order('generated_at', { ascending: true })
      .limit(80),
  ])

  const liveCounts = new Map<string, number>()
  for (const m of liveResult.data ?? []) {
    liveCounts.set(m.category, (liveCounts.get(m.category) ?? 0) + 1)
  }

  const queuedCounts = new Map<string, number>()
  for (const m of queuedResult.data ?? []) {
    queuedCounts.set(m.category, (queuedCounts.get(m.category) ?? 0) + 1)
  }

  const liveCount = liveResult.data?.length ?? 0
  const queueSize = queuedResult.data?.length ?? 0

  // ── 2. Build category health report ──────────────────────────────────────────
  const health = buildHealthReport(liveCounts, queuedCounts)

  // ── 3. Determine release batch size ──────────────────────────────────────────
  // Emergency top-up overrides if any category is below floor and lacks queue coverage
  const hasEmergencyStarvation = health.emergency_warnings.length > 0
  let releaseCount: number

  if (hasEmergencyStarvation || liveCount < MIN_LIVE) {
    releaseCount = RELEASE_BATCH_EMERGENCY
  } else if (health.starvation_warnings.length > 0 || liveCount < TARGET_LIVE) {
    releaseCount = RELEASE_BATCH_NORMAL
  } else {
    releaseCount = RELEASE_MIN_ROLLING
  }

  releaseCount = Math.min(releaseCount, queueSize)

  // ── 4. Select and publish ─────────────────────────────────────────────────────
  let published = 0
  const publishedIds: string[] = []

  if (releaseCount > 0 && queuedResult.data && queuedResult.data.length > 0) {
    const selectedIds = selectWithFloorPriority(
      queuedResult.data.map((m) => ({ id: m.id, category: m.category, end_time: m.end_time })),
      liveCounts,
      releaseCount
    )

    if (selectedIds.length > 0) {
      const { error: publishError } = await supabase
        .from('markets')
        .update({ status: 'live', published_at: now })
        .in('id', selectedIds)

      if (!publishError) {
        published = selectedIds.length
        publishedIds.push(...selectedIds)
      } else {
        console.error('[release-markets] Publish failed:', publishError.message)
      }
    }
  }

  // ── 5a. Archive expired unresolved live markets ──────────────────────────────
  // Markets past their end_time that resolve-expired hasn't caught yet.
  // These should never show in the feed as live bettable cards.
  const { data: expiredLive } = await supabase
    .from('markets')
    .select('id')
    .or('status.eq.live,status.is.null')
    .eq('resolved', false)
    .lt('end_time', now)

  const expiredLiveIds = (expiredLive ?? []).map((m) => m.id)
  let archivedExpiredLive = 0
  if (expiredLiveIds.length > 0) {
    await supabase.from('markets').update({ status: 'archived' }).in('id', expiredLiveIds)
    archivedExpiredLive = expiredLiveIds.length
    console.warn(`[release-markets] Archived ${archivedExpiredLive} expired unresolved market(s) — resolve-expired should have caught these`)
  }

  // ── 5b. Archive expired queued markets (end_time already passed) ─────────────
  // These were never published and can never be bet on.
  const { data: expiredQueued } = await supabase
    .from('markets')
    .select('id')
    .eq('status', 'queued')
    .lt('end_time', now)

  const expiredQueuedIds = (expiredQueued ?? []).map((m) => m.id)
  let archivedExpiredQueued = 0
  if (expiredQueuedIds.length > 0) {
    await supabase.from('markets').update({ status: 'archived' }).in('id', expiredQueuedIds)
    archivedExpiredQueued = expiredQueuedIds.length
  }

  // ── 5. Archive resolved markets beyond retention window ──────────────────────
  const { data: resolvedToArchive } = await supabase
    .from('markets')
    .select('id')
    .eq('resolved', true)
    .or('status.eq.live,status.is.null')
    .lt('created_at', daysAgo(ARCHIVE_RESOLVED_AFTER_DAYS))

  const resolvedIds = (resolvedToArchive ?? []).map((m) => m.id)
  let archivedResolved = 0
  if (resolvedIds.length > 0) {
    await supabase.from('markets').update({ status: 'archived' }).in('id', resolvedIds)
    archivedResolved = resolvedIds.length
  }

  // ── 6. Archive stale queued markets to prevent backlog buildup ───────────────
  const { data: staleQueued } = await supabase
    .from('markets')
    .select('id')
    .eq('status', 'queued')
    .lt('generated_at', daysAgo(ARCHIVE_STALE_QUEUED_AFTER_DAYS))

  const staleIds = (staleQueued ?? []).map((m) => m.id)
  let archivedStale = 0
  if (staleIds.length > 0) {
    await supabase.from('markets').update({ status: 'archived' }).in('id', staleIds)
    archivedStale = staleIds.length
  }

  if (health.starvation_warnings.length > 0) {
    console.warn(`[release-markets] Category starvation: ${health.starvation_warnings.join(', ')}`)
  }
  if (health.emergency_warnings.length > 0) {
    console.error(`[release-markets] Emergency — floor deficit AND empty queue: ${health.emergency_warnings.join(', ')}`)
  }

  return NextResponse.json({
    success: true,
    feed: {
      live_before: liveCount,
      live_after: liveCount + published,
      target: TARGET_LIVE,
    },
    queue: {
      size_before: queueSize,
      size_after: Math.max(0, queueSize - published),
    },
    published,
    published_ids: publishedIds,
    category_health: health.by_category,
    starvation_warnings: health.starvation_warnings,
    emergency_warnings: health.emergency_warnings,
    archived: {
      resolved: archivedResolved,
      stale_queued: archivedStale,
      expired_live: archivedExpiredLive,
      expired_queued: archivedExpiredQueued,
    },
  })
}
