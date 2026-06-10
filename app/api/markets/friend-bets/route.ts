import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/markets/friend-bets?ids=id1,id2,...
 *
 * Returns a map of market_id → array of followed users who bet on it.
 * Used to show "Your friends bet YES" avatar stacks on feed cards.
 *
 * Shape: { [marketId]: { username: string, avatarUrl: string | null, side: 'yes' | 'no' }[] }
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({})

  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 60)
  if (ids.length === 0) return NextResponse.json({})

  const admin = createAdminClient()

  // Who does the current user follow?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: followRows } = await (admin as any)
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', user.id)

  const followingIds: string[] = (followRows ?? []).map((r: { following_id: string }) => r.following_id)
  if (followingIds.length === 0) return NextResponse.json({})

  // Bets placed by followed users on the requested markets
  const { data: bets } = await admin
    .from('bets')
    .select('market_id, user_id, side')
    .in('market_id', ids)
    .in('user_id', followingIds)

  if (!bets || bets.length === 0) return NextResponse.json({})

  // Fetch profiles for users who bet
  const bettorIds = [...new Set(bets.map((b: { user_id: string }) => b.user_id))]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles } = await (admin as any)
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', bettorIds) as { data: Array<{ id: string; username: string; avatar_url: string | null }> | null }

  const profileMap = new Map(
    (profiles ?? []).map((p) =>
      [p.id, { username: p.username, avatarUrl: p.avatar_url }]
    )
  )

  // Build map: marketId → list of friend bet info
  const result: Record<string, { username: string; avatarUrl: string | null; side: string }[]> = {}
  for (const bet of bets as Array<{ market_id: string; user_id: string; side: string }>) {
    const profile = profileMap.get(bet.user_id)
    if (!profile) continue
    if (!result[bet.market_id]) result[bet.market_id] = []
    // Max 4 avatars per market
    if (result[bet.market_id].length < 4) {
      result[bet.market_id].push({ ...profile, side: bet.side })
    }
  }

  return NextResponse.json(result)
}
