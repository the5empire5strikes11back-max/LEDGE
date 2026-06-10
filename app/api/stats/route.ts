import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeAchievements } from '@/lib/achievements'
import { computeCreatorTrust } from '@/lib/creator-trust'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch bets with market category for achievement computation
  // Cast required — Supabase TS inference fails on nested joins
  const { data: rawBets, error } = await supabase
    .from('bets')
    .select('won, amount, payout, created_at, markets(category)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bets = (rawBets ?? []) as Array<{
    won: boolean | null
    amount: number
    payout: number | null
    created_at: string
    markets: { category: string } | null
  }>

  const totalBets = bets.length
  const resolvedBets = bets.filter((b) => b.won !== null)
  const wonBets = resolvedBets.filter((b) => b.won).length
  const winRate = resolvedBets.length > 0 ? Math.round((wonBets / resolvedBets.length) * 100) : 0

  // Best streak + current win streak
  let bestStreak = 0
  let currentStreak = 0
  let currentWinStreak = 0
  for (const bet of resolvedBets) {
    if (bet.won) {
      currentStreak++
      currentWinStreak++
      bestStreak = Math.max(bestStreak, currentStreak)
    } else {
      currentStreak = 0
      currentWinStreak = 0
    }
  }

  // Achievements
  const achievementBets = bets.map((b) => ({
    won: b.won,
    amount: b.amount,
    category: (b.markets as { category?: string } | null)?.category ?? 'Sports',
  }))
  const achievements = computeAchievements(achievementBets)

  // Near-miss: leaderboard rank gap + creator trust + follow counts (parallel)
  const admin = createAdminClient()
  const [profilesResult, creatorTrust, followersResult, followingResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, credits, xp')
      .order('credits', { ascending: false })
      .limit(100),
    computeCreatorTrust(user.id, admin),
    // followers = people who follow ME; following = people I follow.
    // Tolerate the table not existing yet (counts default to 0).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
  ])
  const followersCount = (followersResult as { count: number | null })?.count ?? 0
  const followingCount = (followingResult as { count: number | null })?.count ?? 0

  const profiles = profilesResult.data ?? []
  const myRankIndex = profiles.findIndex((p) => p.id === user.id)
  const leaderboardRank = myRankIndex >= 0 ? myRankIndex + 1 : null
  const top10Gap =
    myRankIndex > 9 && profiles?.[9]
      ? profiles[9].credits - (profiles[myRankIndex]?.credits ?? 0)
      : null

  return NextResponse.json({
    marketsPlayed: totalBets,
    correct: wonBets,
    bestStreak,
    currentWinStreak,
    winRate,
    achievements,
    leaderboardRank,
    top10Gap,
    followersCount,
    followingCount,
    creatorStats: {
      liveMarkets: creatorTrust.liveCount,
      reviewMarkets: creatorTrust.reviewCount,
      trustScore: creatorTrust.score,
      trustTier: creatorTrust.tier,
    },
  })
}
