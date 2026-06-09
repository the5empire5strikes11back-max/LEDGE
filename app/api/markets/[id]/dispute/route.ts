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

  // Verify market exists, is resolved, and within 24h dispute window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: market } = await (supabase as any)
    .from('markets')
    .select('id, resolved, resolved_at')
    .eq('id', id)
    .single()

  if (!market?.resolved) {
    return NextResponse.json({ error: 'Market is not resolved' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedAt = (market as any).resolved_at as string | null
  if (resolvedAt) {
    const hoursAgo = (Date.now() - new Date(resolvedAt).getTime()) / 3_600_000
    if (hoursAgo > 24) {
      return NextResponse.json({ error: 'Dispute window has closed (24h after resolution)' }, { status: 400 })
    }
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
