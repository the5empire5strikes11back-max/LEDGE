import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  CATEGORY_FLOORS,
  buildHealthReport,
  type CategoryHealthReport,
} from '@/app/api/cron/release-markets/route'

/**
 * GET /api/markets/queue-health
 *
 * Debug endpoint — returns a snapshot of live/queued market counts by category,
 * floor targets, starvation warnings, and Sports inventory status.
 *
 * Auth: admin only (CRON_SECRET header) or authenticated users in dev.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isAuthorized =
    (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) ||
    process.env.NODE_ENV !== 'production'

  if (!isAuthorized) {
    // In production, also allow authenticated users (useful for debugging)
    const userClient = await import('@/lib/supabase/server').then((m) => m.createClient())
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch all non-resolved live and queued markets in a single query
  const [liveResult, queuedResult] = await Promise.all([
    supabase
      .from('markets')
      .select('id, category')
      .or('status.eq.live,status.is.null')
      .eq('resolved', false),
    supabase
      .from('markets')
      .select('id, category, end_time, generated_at')
      .eq('status', 'queued'),
  ])

  if (liveResult.error) {
    return NextResponse.json({ error: liveResult.error.message }, { status: 500 })
  }

  // Build per-category count maps
  const liveCounts = new Map<string, number>()
  for (const m of liveResult.data ?? []) {
    liveCounts.set(m.category, (liveCounts.get(m.category) ?? 0) + 1)
  }

  const queuedCounts = new Map<string, number>()
  for (const m of queuedResult.data ?? []) {
    queuedCounts.set(m.category, (queuedCounts.get(m.category) ?? 0) + 1)
  }

  const health: CategoryHealthReport = buildHealthReport(liveCounts, queuedCounts)

  // Sports-heavy generation threshold (mirrors refresh-markets logic)
  const sportsLowThreshold = CATEGORY_FLOORS['Sports'] + 3
  const sportsHeavyTriggered = health.sports_total < sportsLowThreshold

  // Queue age — find oldest queued market to detect backlog staleness
  let oldestQueuedAt: string | null = null
  if (queuedResult.data && queuedResult.data.length > 0) {
    const sorted = [...queuedResult.data].sort((a, b) => {
      const aTime = a.generated_at ?? ''
      const bTime = b.generated_at ?? ''
      return aTime < bTime ? -1 : 1
    })
    oldestQueuedAt = sorted[0].generated_at ?? null
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    feed: {
      live_total: liveResult.data?.length ?? 0,
      queued_total: queuedResult.data?.length ?? 0,
    },
    category_health: health.by_category,
    floors: CATEGORY_FLOORS,
    starvation_warnings: health.starvation_warnings,
    emergency_warnings: health.emergency_warnings,
    sports: {
      total: health.sports_total,
      low_threshold: sportsLowThreshold,
      sports_heavy_triggered: sportsHeavyTriggered,
    },
    queue: {
      size: queuedResult.data?.length ?? 0,
      oldest_generated_at: oldestQueuedAt,
    },
  })
}
