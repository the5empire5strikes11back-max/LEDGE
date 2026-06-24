import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { sellShares, yesPercent as ammYesPercent, seedReserves, type Reserves } from '@/lib/amm'
import { fireEligibleAutoBets } from '@/lib/auto-bet-trigger'
import { repayAdvance } from '@/lib/advance'

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
    .select('id, yes_percent, resolved, end_time, yes_shares, no_shares, virtual_yes_pool, virtual_no_pool, total_credits')
    .eq('id', marketId)
    .maybeSingle()
  const mkt = market as {
    yes_percent: number | null; resolved: boolean; end_time: string
    yes_shares: number | null; no_shares: number | null
    virtual_yes_pool: number | null; virtual_no_pool: number | null; total_credits: number | null
  } | null
  if (!mkt) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  if (mkt.resolved || new Date(mkt.end_time) <= new Date()) {
    return NextResponse.json({ error: 'Market is closed — cash out unavailable' }, { status: 400 })
  }

  // The user's open position (pending = won is null).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bet } = await (admin as any)
    .from('bets')
    .select('id, side, amount, payout, shares, won')
    .eq('user_id', user.id)
    .eq('market_id', marketId)
    .is('won', null)
    .maybeSingle()
  const b = bet as { id: string; side: 'yes' | 'no'; amount: number; payout: number | null; shares: number | null } | null
  if (!b) return NextResponse.json({ error: 'No open position to cash out' }, { status: 404 })
  // Shares held = the locked max payout. Legacy rows store it as `payout`.
  const heldShares = b.shares ?? b.payout
  if (heldShares == null) {
    return NextResponse.json({ error: 'Cash out unavailable for this position' }, { status: 400 })
  }

  // Sell the shares back into the CPMM at the live price — the exact same engine
  // that values the position in the UI, so the cash-out equals the shown value
  // (no drift). Reserves are seeded from current odds for pre-AMM markets.
  const reservesBefore: Reserves =
    mkt.yes_shares != null && mkt.no_shares != null
      ? { y: mkt.yes_shares, n: mkt.no_shares }
      : seedReserves(
          (mkt.yes_percent ?? 50) / 100,
          Math.max(6000, (mkt.virtual_yes_pool ?? 0) + (mkt.virtual_no_pool ?? 0) + (mkt.total_credits ?? 0))
        )
  const { credits: cashoutValue, reserves: reservesAfter } = sellShares(reservesBefore, b.side, heldShares)

  // Credit the user and close the position. Read-modify-write on credits via the
  // service role (authenticated writes to profiles are revoked at the DB level).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('credits, outstanding_advance')
    .eq('id', user.id)
    .single()
  // Repay any outstanding advance off the top of the cash-out proceeds.
  const { net, remaining } = repayAdvance((profile as { outstanding_advance?: number } | null)?.outstanding_advance ?? 0, cashoutValue)
  const newCredits = (profile?.credits ?? 0) + net

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('profiles').update({ credits: newCredits, outstanding_advance: remaining }).eq('id', user.id)
  await admin.from('bets').delete().eq('id', b.id)
  // Push the post-sale reserves + odds back so the market price reflects the exit.
  await (admin as any)
    .from('markets')
    .update({ yes_shares: reservesAfter.y, no_shares: reservesAfter.n, yes_percent: ammYesPercent(reservesAfter) })
    .eq('id', marketId)
  // Drop the cached feed so the next read reflects the post-trade reserves —
  // otherwise a stale cached price makes the displayed live value lag execution.
  revalidatePath('/', 'layout')
  // Selling moved the price — it may have crossed an auto-bet target.
  await fireEligibleAutoBets(admin, marketId)

  // `cashoutValue` reflects what actually hit the wallet (net of any advance
  // repayment); `repaid`/`grossValue` let the UI explain a skim if it happened.
  return NextResponse.json({ cashoutValue: net, grossValue: cashoutValue, repaid: cashoutValue - net, newCredits, side: b.side, amount: b.amount })
}
