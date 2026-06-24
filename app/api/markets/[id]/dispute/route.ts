import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/markets/[id]/dispute
 *
 * Authenticated user flags a resolved market's outcome as incorrect.
 * Only allowed within 24h of resolution, and only for users who placed a bet.
 * One dispute per user per market.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userClient = await import('@/lib/supabase/server').then((m) => m.createClient())
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (reason.length < 10 || reason.length > 500) {
    return NextResponse.json({ error: 'Reason must be 10–500 characters' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // A dispute is valid in two windows:
  //  (a) a resolved market, within 24h of resolved_at (post-resolution complaint);
  //  (b) a creator-proposed market still being held, within CREATOR_DISPUTE_HOURS
  //      of creator_resolved_at — these disputes can flip the outcome to a void.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: market } = await (supabase as any)
    .from('markets')
    .select('id, created_by, resolved, resolved_at, resolution_mode, creator_proposed_winner, creator_resolved_at')
    .eq('id', id)
    .single()

  if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

  // The creator can't dispute their own market.
  if (market.created_by === user.id) {
    return NextResponse.json({ error: "You can't dispute your own market" }, { status: 403 })
  }

  const HOUR = 3_600_000
  const inCreatorWindow =
    market.resolution_mode === 'creator' &&
    !market.resolved &&
    market.creator_proposed_winner &&
    market.creator_resolved_at &&
    (Date.now() - new Date(market.creator_resolved_at as string).getTime()) / HOUR <= 24
  const inResolvedWindow =
    market.resolved &&
    (!market.resolved_at || (Date.now() - new Date(market.resolved_at as string).getTime()) / HOUR <= 24)

  if (!inCreatorWindow && !inResolvedWindow) {
    return NextResponse.json({ error: 'This market is not open for disputes' }, { status: 400 })
  }

  // Verify user has a bet on this market
  const { data: bet } = await supabase
    .from('bets')
    .select('id')
    .eq('market_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!bet) {
    return NextResponse.json({ error: 'You must have a bet to dispute' }, { status: 403 })
  }

  // Insert dispute (unique constraint prevents duplicates)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('market_disputes')
    .insert({ market_id: id, user_id: user.id, reason })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You already disputed this market' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
