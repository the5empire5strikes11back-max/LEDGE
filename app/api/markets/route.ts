import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let query = supabase
    .from('markets')
    .select('*')
    .order('created_at', { ascending: false })

  if (category && category !== 'All') {
    query = query.eq('category', category as import('@/types/database').MarketCategory)
  }

  const { data: markets, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Attach the current user's bet for each market
  const marketIds = markets.map((m) => m.id)
  const { data: userBets } = await supabase
    .from('bets')
    .select('market_id, side, amount, payout, won')
    .eq('user_id', user.id)
    .in('market_id', marketIds)

  const betMap = new Map(userBets?.map((b) => [b.market_id, b]) ?? [])

  const enriched = markets.map((market) => {
    const userBet = betMap.get(market.id)
    // Near-miss: resolved market whose final odds were within 10pp of flipping
    const isNearMiss =
      !!market.resolved &&
      market.yes_percent >= 40 &&
      market.yes_percent <= 60

    return {
      ...market,
      endTime: market.end_time,
      yesPercent: market.yes_percent,
      yesPool: market.yes_pool ?? 0,
      noPool: market.no_pool ?? 0,
      totalCredits: market.total_credits,
      jackpotPool: market.jackpot_pool,
      hotScore: market.hot_score ?? 0,
      momentumShift: market.momentum_shift ?? 0,
      isFeatured: market.is_featured ?? false,
      isNearMiss,
      resolved: market.resolved ? { winner: market.winner } : undefined,
      userBet: userBet ? { side: userBet.side, amount: userBet.amount } : undefined,
    }
  })

  // Sort: featured pinned first → hottest unresolved → DB order (recency)
  enriched.sort((a, b) => {
    if (a.isFeatured && !b.isFeatured) return -1
    if (!a.isFeatured && b.isFeatured) return 1
    if (!a.resolved && !b.resolved && a.hotScore !== b.hotScore) {
      return b.hotScore - a.hotScore
    }
    return 0
  })

  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, category, end_time, jackpot_pool } = body

  if (!title || !category || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('markets')
    .insert({ title, category, end_time, jackpot_pool: jackpot_pool ?? 0, created_by: user.id })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
