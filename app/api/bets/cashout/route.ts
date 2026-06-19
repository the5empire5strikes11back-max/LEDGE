import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/bets/cashout  { market_id }
 *
 * The simplified version of "sell your position" on Polymarket/Kalshi. Closes
 * the user's open position on a live market early, paying the current value of
 * their locked payout: floor(currentProbOfTheirSide × lockedPayout).
 *
 * Because the locked payout already carries the 5% house margin, cashing out at
 * the same odds you entered returns slightly less than your stake (the spread) —
 * so there's no free arbitrage, and the value rises/falls as the odds move for or
 * against you. No order book, no shares: one number, one tap.
 *
 * v1: the position is removed outright (so resolution never double-settles it).
 */
export async function POST(request: Request) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const marketId: string | undefined = body.market_id
  if (!marketId) return NextResponse.json({ error: 'Missing market_id' }, { status: 400 })

  const admin = createAdminClient()

  // Market must be live — you can only cash out before it closes/resolves.
  const { data: market } = await admin
    .from('markets')
    .select('id, yes_percent, resolved, end_time')
    .eq('id', marketId)
    .maybeSingle()
  const mkt = market as { yes_percent: number | null; resolved: boolean; end_time: string } | null
  if (!mkt) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  if (mkt.resolved || new Date(mkt.end_time) <= new Date()) {
    return NextResponse.json({ error: 'Market is closed — cash out unavailable' }, { status: 400 })
  }

  // The user's open position (pending = won is null).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bet } = await (admin as any)
    .from('bets')
    .select('id, side, amount, payout, won')
    .eq('user_id', user.id)
    .eq('market_id', marketId)
    .is('won', null)
    .maybeSingle()
  const b = bet as { id: string; side: 'yes' | 'no'; amount: number; payout: number | null } | null
  if (!b) return NextResponse.json({ error: 'No open position to cash out' }, { status: 404 })
  if (b.payout == null) {
    return NextResponse.json({ error: 'Cash out unavailable for this position' }, { status: 400 })
  }

  const yesPct = mkt.yes_percent ?? 50
  const sideProb = b.side === 'yes' ? yesPct : 100 - yesPct
  const cashoutValue = Math.max(0, Math.floor((sideProb / 100) * b.payout))

  // Credit the user and close the position. Read-modify-write on credits via the
  // service role (authenticated writes to profiles are revoked at the DB level).
  const { data: profile } = await admin
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()
  const newCredits = (profile?.credits ?? 0) + cashoutValue

  await admin.from('profiles').update({ credits: newCredits }).eq('id', user.id)
  await admin.from('bets').delete().eq('id', b.id)

  return NextResponse.json({ cashoutValue, newCredits, side: b.side, amount: b.amount })
}
