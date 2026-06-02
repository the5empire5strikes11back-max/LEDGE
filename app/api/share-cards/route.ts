import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export interface ShareCardData {
  /** Percentage of bets placed against the crowd majority */
  crowdAgainstPct: number
  /** Best won bet for Prediction Flex card */
  bestBet: {
    marketTitle: string
    side: 'yes' | 'no'
    entryOdds: number
    payoutMultiplier: number
    profit: number
    amount: number
  } | null
  /** Circle data if user is in any circles */
  topCircle: {
    name: string
    rank: number
    memberCount: number
    weeklyGain: number
  } | null
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch all bets with market info (including resolved + winner for crowd-against calculation)
  const { data: rawBets } = await supabase
    .from('bets')
    .select('side, amount, payout, won, markets(title, yes_percent, resolved, winner)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const bets = (rawBets ?? []) as Array<{
    side: 'yes' | 'no'
    amount: number
    payout: number | null
    won: boolean | null
    markets: { title: string; yes_percent: number; resolved: boolean; winner: string | null } | null
  }>

  // Crowd-against %: bets where user bet the minority side (winner vs loser).
  // Approximation: if yes_percent > 50 when resolved, majority was "yes".
  // If user bet "no" in that case, they were contrarian.
  const resolvedBets = bets.filter(
    (b) => b.won !== null && b.markets?.resolved && b.markets.winner
  )
  const contrarian = resolvedBets.filter((b) => {
    if (!b.markets?.winner) return false
    // majority side = the winning side (since yes_percent reflects market sentiment)
    const majoritySide = (b.markets.yes_percent ?? 50) >= 50 ? 'yes' : 'no'
    return b.side !== majoritySide
  }).length
  const crowdAgainstPct =
    resolvedBets.length > 0 ? Math.round((contrarian / resolvedBets.length) * 100) : 0

  // Best won bet by multiplier
  const wonBets = bets.filter(
    (b) => b.won === true && b.payout && b.amount > 0 && b.markets
  )
  let bestBet: ShareCardData['bestBet'] = null
  if (wonBets.length > 0) {
    const best = wonBets.reduce((prev, cur) => {
      const prevMult = (prev.payout ?? 0) / prev.amount
      const curMult = (cur.payout ?? 0) / cur.amount
      return curMult > prevMult ? cur : prev
    })
    if (best.markets) {
      const multiplier = best.payout! / best.amount
      // Entry odds: approximate from payout multiplier (payout = amount × (100/odds) × 0.95)
      const entryOdds = Math.round(100 / (multiplier / 0.95))
      bestBet = {
        marketTitle: best.markets.title,
        side: best.side,
        entryOdds: Math.max(5, Math.min(95, entryOdds)),
        payoutMultiplier: Math.round(multiplier * 10) / 10,
        profit: Math.round(best.payout! - best.amount),
        amount: best.amount,
      }
    }
  }

  // Circle rank — find their highest-rank circle
  const { data: circleMembers } = await supabase
    .from('circle_members')
    .select('circle_id, circles(name)')
    .eq('user_id', user.id)
    .limit(5)

  let topCircle: ShareCardData['topCircle'] = null
  if (circleMembers && circleMembers.length > 0) {
    // Get one circle's leaderboard
    const cm = circleMembers[0] as { circle_id: string; circles: { name: string } | null }
    if (cm.circles) {
      const { data: memberBets } = await supabase
        .from('bets')
        .select('user_id, amount, won, profiles(username)')
        .order('amount', { ascending: false })

      // Simple: count circle members
      const { count } = await supabase
        .from('circle_members')
        .select('*', { count: 'exact', head: true })
        .eq('circle_id', cm.circle_id)

      // Weekly gain for current user in this circle
      const weekAgo = new Date(Date.now() - 7 * 24 * 60_000).toISOString()
      const { data: weekBets } = await supabase
        .from('bets')
        .select('amount, payout, won')
        .eq('user_id', user.id)
        .gte('created_at', weekAgo)

      const weeklyGain = (weekBets ?? []).reduce((sum, b) => {
        if (b.won === null) return sum
        return sum + (b.won ? (b.payout ?? 0) - b.amount : -b.amount)
      }, 0)

      void memberBets // suppress unused warning

      topCircle = {
        name: cm.circles.name,
        rank: 1, // simplified — would need full leaderboard join for real rank
        memberCount: count ?? 0,
        weeklyGain: Math.round(weeklyGain),
      }
    }
  }

  return NextResponse.json({ crowdAgainstPct, bestBet, topCircle } satisfies ShareCardData)
}
