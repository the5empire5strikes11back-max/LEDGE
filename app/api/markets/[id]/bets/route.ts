import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { seedReserves, buyShares, addLiquidity, LIQUIDITY_REINVEST_RATE, priceYes, type Reserves } from '@/lib/amm'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const admin = createAdminClient()
  const { data: marketRow } = await admin
    .from('markets')
    .select('circle_id, virtual_yes_pool, virtual_no_pool, yes_percent, total_credits, created_at, published_at')
    .eq('id', id)
    .maybeSingle()

  const mkt = marketRow as {
    circle_id?: string | null
    virtual_yes_pool?: number | null
    virtual_no_pool?: number | null
    yes_percent?: number | null
    total_credits?: number | null
    created_at?: string | null
    published_at?: string | null
  } | null

  if (mkt?.circle_id) {
    const { data: membership } = await admin
      .from('circle_members')
      .select('circle_id')
      .eq('circle_id', mkt.circle_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawBets, error } = await (admin as any)
    .from('bets')
    .select('id, side, amount, created_at, profiles(username, avatar_url)')
    .eq('market_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bets = (rawBets ?? []) as Array<{
    id: string
    side: string
    amount: number
    created_at: string
    profiles: { username: string; avatar_url?: string | null } | null
  }>

  // Replay the CPMM to reconstruct the exact probability at each trade.
  // Seeds initial reserves from virtual pools (same formula as the live engine),
  // then runs buyShares + addLiquidity for each bet in order.
  const vy = mkt?.virtual_yes_pool ?? 0
  const vn = mkt?.virtual_no_pool ?? 0
  const openingPct = (mkt?.yes_percent ?? 50)
  const depth = Math.max(6000, vy + vn + (mkt?.total_credits ?? 0))

  const openingProbYes = vn > 0 || vy > 0
    ? vn / (vy + vn)
    : openingPct / 100

  const history: { timestamp: string; yesPercent: number }[] = []

  if (bets.length > 0) {
    let reserves: Reserves = seedReserves(openingProbYes, depth)

    history.push({
      timestamp: mkt?.published_at ?? mkt?.created_at ?? bets[0].created_at,
      yesPercent: Math.round(priceYes(reserves) * 1000) / 10,
    })

    for (const b of bets) {
      const buy = buyShares(reserves, b.side as 'yes' | 'no', b.amount)
      reserves = addLiquidity(buy.reserves, b.amount * LIQUIDITY_REINVEST_RATE)
      history.push({
        timestamp: b.created_at,
        yesPercent: Math.round(priceYes(reserves) * 1000) / 10,
      })
    }
  }

  return NextResponse.json({
    bets: bets.map((b) => ({
      id: b.id,
      username: b.profiles?.username ?? 'anon',
      avatarUrl: b.profiles?.avatar_url ?? null,
      side: b.side,
      amount: b.amount,
      created_at: b.created_at,
    })),
    history,
  })
}
