import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/leaderboard?sort=credits|winrate|streak&limit=50&view=global|near-me&period=week|month|all
 *
 * sort=credits  — ranked by total credits (default)
 * sort=winrate  — ranked by win rate (min 3 bets to qualify)
 * sort=streak   — ranked by current streak
 * view=near-me  — returns ±15 users around the current user + percentile
 * period=week|month — filter bets to last 7 or 30 days (winrate sort only)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sort = searchParams.get('sort') ?? 'credits'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100)
  const view = searchParams.get('view') ?? 'global'
  const period = searchParams.get('period') ?? 'all'

  const admin = createAdminClient()

  // Fetch all profiles sorted by the primary sort key
  const orderCol =
    sort === 'streak' ? 'streak' : 'credits'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProfiles, error } = await (admin as any)
    .from('profiles')
    .select('id, username, credits, rank, streak, avatar_url, xp')
    .order(orderCol, { ascending: false })
    .limit(sort === 'winrate' ? 200 : limit) // fetch more for winrate so we can re-sort

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const profiles = (rawProfiles ?? []) as Array<{
    id: string; username: string; credits: number; rank: string
    streak: number; avatar_url?: string | null; xp: number
  }>

  const profileIds = profiles.map((p) => p.id)

  // Global markets only — prevent circle farming
  const { data: globalMarkets } = await admin
    .from('markets')
    .select('id')
    .is('circle_id', null)

  const globalMarketIds = (globalMarkets ?? []).map((m) => m.id)

  // Period cutoff for winrate filtering
  let periodCutoff: string | null = null
  if (period === 'week') {
    const d = new Date(); d.setDate(d.getDate() - 7); periodCutoff = d.toISOString()
  } else if (period === 'month') {
    const d = new Date(); d.setDate(d.getDate() - 30); periodCutoff = d.toISOString()
  }

  // Bet stats for all profiles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let betQuery = (admin as any)
    .from('bets')
    .select('user_id, amount, payout, won')
    .in('user_id', profileIds)
    .in('market_id', globalMarketIds.length > 0 ? globalMarketIds : ['__none__'])
    .not('won', 'is', null)

  if (periodCutoff) betQuery = betQuery.gte('created_at', periodCutoff)

  const { data: betStats } = await betQuery

  const statsMap = new Map<string, {
    totalBets: number; wonBets: number; totalWagered: number; totalPayout: number
  }>()

  for (const bet of betStats ?? []) {
    const s = statsMap.get(bet.user_id) ?? { totalBets: 0, wonBets: 0, totalWagered: 0, totalPayout: 0 }
    s.totalBets++
    s.totalWagered += bet.amount
    if (bet.won) { s.wonBets++; s.totalPayout += bet.payout ?? 0 }
    statsMap.set(bet.user_id, s)
  }

  const enriched = profiles.map((p) => {
    const s = statsMap.get(p.id)
    const winRate = s && s.totalBets >= 3 ? Math.round((s.wonBets / s.totalBets) * 100) : 0
    const netProfit = s ? s.totalPayout - s.totalWagered : 0
    const pnl = s && s.totalWagered > 0 ? Math.round((netProfit / s.totalWagered) * 100 * 10) / 10 : 0
    return {
      id: p.id,
      username: p.username,
      avatarUrl: p.avatar_url ?? null,
      credits: p.credits,
      rankLabel: p.rank,
      streak: p.streak,
      xp: p.xp,
      winRate,
      pnl,
      totalBets: s?.totalBets ?? 0,
      isCurrentUser: p.id === user.id,
    }
  })

  // Re-sort for winrate mode (filter min 3 bets, sort desc)
  if (sort === 'winrate') {
    enriched.sort((a, b) => b.winRate - a.winRate || b.totalBets - a.totalBets)
  }

  const totalUsers = enriched.length

  // Percentile: how many users you're better than (credits basis)
  const userGlobalIdx = enriched.findIndex((e) => e.isCurrentUser)
  const percentile = userGlobalIdx !== -1 && totalUsers > 1
    ? Math.round(((totalUsers - 1 - userGlobalIdx) / (totalUsers - 1)) * 100)
    : null

  if (view === 'near-me' && userGlobalIdx !== -1) {
    const WINDOW = 15
    const start = Math.max(0, userGlobalIdx - WINDOW)
    const end   = Math.min(enriched.length, userGlobalIdx + WINDOW + 1)
    const nearSlice = enriched.slice(start, end).map((e, i) => ({ ...e, rank: start + i + 1 }))
    return NextResponse.json({ leaderboard: nearSlice, userEntry: null, percentile, totalUsers })
  }

  const top = enriched.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }))

  // Always include current user even if outside top N
  const userInTop = top.some((e) => e.isCurrentUser)
  let userEntry = null
  if (!userInTop) {
    const idx = enriched.findIndex((e) => e.isCurrentUser)
    if (idx !== -1) userEntry = { ...enriched[idx], rank: idx + 1 }
  }

  return NextResponse.json({ leaderboard: top, userEntry, percentile, totalUsers })
}
