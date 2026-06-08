import { isAdminRequest } from '@/lib/validate'
/**
 * GET /api/markets/rank-debug
 *
 * Returns every unresolved market with its full signal breakdown.
 * Useful for tuning weights in lib/feed-ranker.ts.
 *
 * Example response item:
 *   {
 *     "id": "...",
 *     "title": "Will the Knicks win tonight?",
 *     "rank": {
 *       "velocity": 0.632,
 *       "urgency": 0.950,
 *       "momentum": 0.333,
 *       "hot_score": 0.451,
 *       "tension": 0.720,
 *       "social": 0.000,
 *       "total": 0.694,
 *       "pinned": false
 *     }
 *   }
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { debugRankScore, WEIGHTS } from '@/lib/feed-ranker'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [marketsResult, circleMembershipsResult] = await Promise.all([
    supabase
      .from('markets')
      .select('id, title, category, created_at, end_time, resolved, is_featured, yes_percent, hot_score, momentum_shift, total_credits, circle_id')
      .eq('resolved', false),
    supabase
      .from('circle_members')
      .select('circle_id')
      .eq('user_id', user.id),
  ])

  if (marketsResult.error) {
    return NextResponse.json({ error: marketsResult.error.message }, { status: 500 })
  }

  const markets = marketsResult.data ?? []
  const userCircleIds = new Set(
    (circleMembershipsResult.data ?? []).map((cm) => cm.circle_id)
  )

  const nowMs = Date.now()

  const debug = markets
    .map((m) => ({
      id: m.id,
      title: m.title,
      category: m.category,
      hot_score: m.hot_score,
      yes_percent: m.yes_percent,
      momentum_shift: m.momentum_shift,
      hours_remaining: +((new Date(m.end_time).getTime() - nowMs) / 3_600_000).toFixed(1),
      rank: debugRankScore(m, userCircleIds, nowMs),
    }))
    .sort((a, b) => b.rank.total - a.rank.total)

  return NextResponse.json({
    weights: WEIGHTS,
    markets: debug,
  })
}
