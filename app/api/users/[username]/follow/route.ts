/**
 * POST /api/users/[username]/follow  — follow or unfollow (toggle)
 * Returns { following: boolean, followers_count: number }
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Resolve target username → id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: target } = await (admin as any)
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single() as { data: { id: string } | null }

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.id === user.id) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })

  // Check existing follow
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from('user_follows')
    .select('follower_id')
    .eq('follower_id', user.id)
    .eq('following_id', target.id)
    .maybeSingle() as { data: { follower_id: string } | null }

  if (existing) {
    // Unfollow
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('user_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', target.id)
  } else {
    // Follow
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('user_follows')
      .insert({ follower_id: user.id, following_id: target.id })
  }

  // Return updated followers count for target
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (admin as any)
    .from('user_follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', target.id) as { count: number | null }

  return NextResponse.json({ following: !existing, followers_count: count ?? 0 })
}
