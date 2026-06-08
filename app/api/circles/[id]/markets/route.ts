import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { seedLiquidity } from '@/lib/liquidity'

// GET /api/circles/[id]/markets — fetch all markets for a circle
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // Verify user is a member of this circle
  const { data: membership } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this circle' }, { status: 403 })
  }

  // Fetch circle markets + user's bet on each
  const [marketsResult, userBetsResult] = await Promise.all([
    supabase
      .from('markets')
      .select('*')
      .eq('circle_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('bets')
      .select('market_id, side, amount, payout, won')
      .eq('user_id', user.id),
  ])

  if (marketsResult.error) {
    return NextResponse.json({ error: marketsResult.error.message }, { status: 500 })
  }

  const betMap = new Map((userBetsResult.data ?? []).map((b) => [b.market_id, b]))

  const markets = (marketsResult.data ?? []).map((m) => {
    const userBet = betMap.get(m.id)
    const isNearMiss =
      !!m.resolved &&
      (m.yes_percent ?? 50) >= 40 &&
      (m.yes_percent ?? 50) <= 60

    return {
      id: m.id,
      title: m.title,
      category: m.category,
      endTime: m.end_time,
      yesPercent: m.yes_percent ?? 50,
      yesPool: m.yes_pool ?? 0,
      noPool: m.no_pool ?? 0,
      totalCredits: m.total_credits ?? 0,
      hotScore: m.hot_score ?? 0,
      momentumShift: m.momentum_shift ?? 0,
      isFeatured: m.is_featured ?? false,
      isNearMiss,
      resolved: m.resolved && m.winner ? { winner: m.winner as 'yes' | 'no' } : undefined,
      userBet: userBet ? { side: userBet.side as 'yes' | 'no', amount: userBet.amount } : undefined,
    }
  })

  return NextResponse.json(markets)
}

// POST /api/circles/[id]/markets — create a market inside a circle
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // Must be a circle member
  const { data: membership } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this circle' }, { status: 403 })
  }

  const body = await request.json()
  const { title, end_time } = body as { title?: string; end_time?: string }

  if (!title?.trim()) return NextResponse.json({ error: 'Question is required' }, { status: 400 })
  if (!end_time) return NextResponse.json({ error: 'End time is required' }, { status: 400 })

  const endDate = new Date(end_time)
  if (isNaN(endDate.getTime()) || endDate <= new Date()) {
    return NextResponse.json({ error: 'End time must be in the future' }, { status: 400 })
  }

  // Circle markets use reduced liquidity seed
  const liquiditySeed = seedLiquidity('Circle', false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: market, error } = await (supabase as any)
    .from('markets')
    .insert({
      title: title.trim(),
      category: 'Circle',
      end_time,
      circle_id: id,
      created_by: user.id,
      jackpot_pool: 0,
      // Circle markets bypass the AI queue — go live immediately
      status: 'live',
      published_at: new Date().toISOString(),
      ...liquiditySeed,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Bust the main feed cache so the new market appears on next load
  revalidatePath('/', 'layout')

  return NextResponse.json(market, { status: 201 })
}
