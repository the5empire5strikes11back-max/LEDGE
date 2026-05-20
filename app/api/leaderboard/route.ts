import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, credits, rank, streak')
    .order('credits', { ascending: false })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const profileIds = profiles.map((p) => p.id)

  // Step 1 — collect IDs of all global public markets (no circle affiliation).
  // Prevents circle farming from inflating leaderboard stats.
  const { data: globalMarkets } = await supabase
    .from('markets')
    .select('id')
    .is('circle_id', null)

  const globalMarketIds = (globalMarkets ?? []).map((m) => m.id)

  // Step 2 — bets on those markets only
  const { data: betStats } = await supabase
    .from('bets')
    .select('user_id, amount, payout, won')
    .in('user_id', profileIds)
    .in('market_id', globalMarketIds.length > 0 ? globalMarketIds : ['__none__'])
    .not('won', 'is', null)

  const statsMap = new Map<
    string,
    { totalBets: number; wonBets: number; totalWagered: number; totalPayout: number }
  >()

  for (const bet of betStats ?? []) {
    const s = statsMap.get(bet.user_id) ?? {
      totalBets: 0,
      wonBets: 0,
      totalWagered: 0,
      totalPayout: 0,
    }
    s.totalBets++
    s.totalWagered += bet.amount
    if (bet.won) {
      s.wonBets++
      s.totalPayout += bet.payout ?? 0
    }
    statsMap.set(bet.user_id, s)
  }

  const leaderboard = profiles.map((p, i) => {
    const s = statsMap.get(p.id)
    const winRate =
      s && s.totalBets > 0 ? Math.round((s.wonBets / s.totalBets) * 100) : 0
    const netProfit = s ? s.totalPayout - s.totalWagered : 0
    const pnl =
      s && s.totalWagered > 0
        ? Math.round((netProfit / s.totalWagered) * 100 * 10) / 10
        : 0
    return {
      rank: i + 1,
      id: p.id,
      username: p.username,
      credits: p.credits,
      rankLabel: p.rank,
      streak: p.streak,
      winRate,
      pnl,
      isCurrentUser: p.id === user.id,
    }
  })

  return NextResponse.json(leaderboard)
}
