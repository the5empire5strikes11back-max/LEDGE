import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeAchievements } from '@/lib/achievements'
import { calculatePersona, rankFromXP } from '@/lib/game-engine'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: profileError } = await (admin as any)
    .from('profiles')
    .select('id, username, avatar_url, xp, streak, is_plus, created_at')
    .eq('username', username)
    .single() as { data: { id: string; username: string; avatar_url: string | null; xp: number; streak: number; is_plus: boolean; created_at: string } | null; error: unknown }

  if (profileError || !profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { data: rawBets } = await admin
    .from('bets')
    .select('won, amount, side, created_at, markets(title, category)')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: true })

  const bets = (rawBets ?? []) as Array<{
    won: boolean | null
    amount: number
    side: string
    created_at: string
    markets: { title: string; category: string } | null
  }>

  const resolvedBets = bets.filter((b) => b.won !== null)
  const wonBets      = resolvedBets.filter((b) => b.won).length
  const winRate      = resolvedBets.length > 0 ? Math.round((wonBets / resolvedBets.length) * 100) : 0

  let bestStreak = 0
  let current    = 0
  for (const bet of resolvedBets) {
    if (bet.won) { current++; bestStreak = Math.max(bestStreak, current) }
    else { current = 0 }
  }

  const achievementBets = bets.map((b) => ({
    won:      b.won,
    amount:   b.amount,
    category: b.markets?.category ?? 'Sports',
  }))
  const achievements = computeAchievements(achievementBets)

  const personaBets = bets.map((b) => ({
    won:         b.won ?? false,
    side:        b.side as 'yes' | 'no',
    category:    (b.markets?.category ?? 'Sports') as 'Sports' | 'Politics' | 'Culture' | 'Circle',
    majorityWas: b.side as 'yes' | 'no', // best approximation without historical majority data
  }))
  const persona = calculatePersona(personaBets)

  const recentBets = resolvedBets
    .slice(-5)
    .reverse()
    .map((b) => ({
      market_title: b.markets?.title ?? 'Unknown market',
      side:         b.side,
      won:          b.won,
      created_at:   b.created_at,
    }))

  const rank = rankFromXP(profile.xp)

  // Follow counts + is_following for current user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ count: followersCount }, { count: followingCount }, followRow] = await Promise.all([
    (admin as any).from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
    (admin as any).from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
    currentUser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (admin as any).from('user_follows').select('follower_id').eq('follower_id', currentUser.id).eq('following_id', profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]) as [{ count: number | null }, { count: number | null }, { data: unknown }]

  return NextResponse.json({
    username:        profile.username,
    avatar_url:      profile.avatar_url,
    rank,
    xp:              profile.xp,
    streak:          profile.streak,
    is_plus:         profile.is_plus,
    created_at:      profile.created_at,
    win_rate:        winRate,
    total_bets:      bets.length,
    best_streak:     bestStreak,
    persona,
    achievements,
    recent_bets:     recentBets,
    followers_count: followersCount ?? 0,
    following_count: followingCount ?? 0,
    is_following:    !!followRow.data,
    is_self:         currentUser?.id === profile.id,
  })
}
