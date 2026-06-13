import { createClient, createAdminClient } from '@/lib/supabase/server'
import { computeYesPercent } from '@/lib/liquidity'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Fetch the market once: circle gate + the liquidity state needed to
  // reconstruct an accurate probability history.
  const admin = createAdminClient()
  const { data: marketRow } = await admin
    .from('markets')
    .select('circle_id, virtual_yes_pool, virtual_no_pool, hot_score, created_at')
    .eq('id', id)
    .maybeSingle()

  const mkt = marketRow as {
    circle_id?: string | null
    virtual_yes_pool?: number | null
    virtual_no_pool?: number | null
    hot_score?: number | null
    created_at?: string | null
  } | null

  // Private circle markets: only members may view betting activity.
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

  // Read EVERY bet on this market — this is public market activity (like an
  // order book), the basis for crowd stats and recent trades. The admin client
  // is required because RLS (`bets_select_own`) limits the user client to the
  // caller's own bets; crowd stats must reflect all traders. Circle privacy is
  // already enforced by the membership gate above.
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

  // Reconstruct probability history with the SAME formula as live trading
  // (computeYesPercent — real bets blended with decaying virtual liquidity), so
  // the chart matches the headline odds instead of diverging. Virtual depth and
  // the per-step hot_score are replayed exactly as they were when each bet landed
  // (hot_score increments by 1 per bet, so initialHot = current − betCount).
  const vy = mkt?.virtual_yes_pool ?? 0
  const vn = mkt?.virtual_no_pool ?? 0
  const initialHot = Math.max(0, (mkt?.hot_score ?? bets.length) - bets.length)

  const history: { timestamp: string; yesPercent: number }[] = []
  if (bets.length > 0) {
    // Opening point — the market's odds before any real bet landed
    history.push({
      timestamp: mkt?.created_at ?? bets[0].created_at,
      yesPercent: computeYesPercent({
        yes_pool: 0, no_pool: 0,
        virtual_yes_pool: vy, virtual_no_pool: vn,
        hot_score: initialHot,
      }),
    })
    let realYes = 0
    let realNo = 0
    bets.forEach((b, i) => {
      if (b.side === 'yes') realYes += b.amount
      else realNo += b.amount
      history.push({
        timestamp: b.created_at,
        yesPercent: computeYesPercent({
          yes_pool: realYes, no_pool: realNo,
          virtual_yes_pool: vy, virtual_no_pool: vn,
          hot_score: initialHot + i + 1,
        }),
      })
    })
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
