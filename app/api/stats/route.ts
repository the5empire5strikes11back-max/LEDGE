import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { computeAchievements } from '@/lib/achievements'
import { computeCreatorTrust } from '@/lib/creator-trust'

const computeStats = unstable_cache(
  async (userId: string) => {
    const admin = createAdminClient()

    const [rawBetsResult, profilesResult, creatorTrust, followersResult, followingResult] = await Promise.all([
      admin
        .from('bets')
        .select('won, amount, payout, created_at, bet_price, markets(category)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      admin
        .from('profiles')
        .select('id, credits, xp')
        .order('credits', { ascending: false })
        .limit(100),
      computeCreatorTrust(userId, admin),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
    ])

    if (rawBetsResult.error) throw new Error(rawBetsResult.error.message)

    const bets = (rawBetsResult.data ?? []) as unknown as Array<{
      won: boolean | null
      amount: number
      payout: number | null
      created_at: string
      bet_price: number | null
      markets: { category: string } | null
    }>

    const totalBets = bets.length
    const resolvedBets = bets.filter((b) => b.won !== null)
    const wonBets = resolvedBets.filter((b) => b.won).length
    const winRate = resolvedBets.length > 0 ? Math.round((wonBets / resolvedBets.length) * 100) : 0

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

    const achievementBets = bets.map((b) => ({
      won: b.won,
      amount: b.amount,
      category: (b.markets as { category?: string } | null)?.category ?? 'Sports',
    }))
    const achievements = computeAchievements(achievementBets)

    const calibratable = resolvedBets.filter((b) => b.bet_price != null)
    let calibrationScore: number | null = null
    if (calibratable.length >= 5) {
      const avgBrier = calibratable.reduce((sum, b) => {
        const outcome = b.won ? 1 : 0
        const diff = outcome - (b.bet_price as number)
        return sum + diff * diff
      }, 0) / calibratable.length
      calibrationScore = Math.round((1 - avgBrier) * 100)
    }

    const profiles = profilesResult.data ?? []
    const myRankIndex = profiles.findIndex((p) => p.id === userId)
    const leaderboardRank = myRankIndex >= 0 ? myRankIndex + 1 : null
    const top10Gap =
      myRankIndex > 9 && profiles?.[9]
        ? profiles[9].credits - (profiles[myRankIndex]?.credits ?? 0)
        : null

    return {
      marketsPlayed: totalBets,
      correct: wonBets,
      bestStreak,
      currentWinStreak,
      winRate,
      calibrationScore,
      achievements,
      leaderboardRank,
      top10Gap,
      followersCount: (followersResult as { count: number | null })?.count ?? 0,
      followingCount: (followingResult as { count: number | null })?.count ?? 0,
      creatorStats: {
        liveMarkets: creatorTrust.liveCount,
        reviewMarkets: creatorTrust.reviewCount,
        trustScore: creatorTrust.score,
        trustTier: creatorTrust.tier,
      },
    }
  },
  ['user-stats-v1'],
  { revalidate: 45 }
)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const stats = await computeStats(user.id)
    return NextResponse.json(stats)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
