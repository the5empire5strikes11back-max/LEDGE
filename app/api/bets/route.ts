import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { XP_PER_BET, CIRCLE_BET_MAX_CR, WHALE_BET_THRESHOLD, MOMENTUM_SHIFT_THRESHOLD, calculateFixedOddsPayout } from '@/lib/game-engine'
import { pushToMarketBettors } from '@/lib/push'
import { computeYesPercent, type PoolState } from '@/lib/liquidity'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bets')
    .select('*, markets(title, category)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  try {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { market_id, side, amount } = body as {
    market_id?: string
    side?: 'yes' | 'no'
    amount?: number
  }

  if (!market_id || !side || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid bet data' }, { status: 400 })
  }

  // Fetch market — include virtual pools for liquidity-aware odds calculation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: market, error: marketError } = await (supabase as any)
    .from('markets')
    .select('id, title, resolved, end_time, circle_id, yes_pool, no_pool, yes_percent, total_credits, hot_score, virtual_yes_pool, virtual_no_pool')
    .eq('id', market_id)
    .single() as { data: {
      id: string; title: string; resolved: boolean; end_time: string
      circle_id: string | null; yes_pool: number; no_pool: number
      yes_percent: number; total_credits: number; hot_score: number
      virtual_yes_pool: number; virtual_no_pool: number
    } | null, error: unknown }

  if (marketError) {
    const errMsg = (marketError as { message?: string })?.message ?? JSON.stringify(marketError)
    console.error('[/api/bets] Market fetch error:', marketError)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
  if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  if (market.resolved || new Date(market.end_time) < new Date()) {
    return NextResponse.json({ error: 'Market is closed' }, { status: 400 })
  }

  // Anti-Sybil: cap bets inside user-created Circle markets
  const cappedAmount = market.circle_id ? Math.min(amount, CIRCLE_BET_MAX_CR) : amount

  // Lock payout at current odds — fixed at time of bet, never changes
  const impliedProbPct = side === 'yes'
    ? (market.yes_percent ?? 50)
    : 100 - (market.yes_percent ?? 50)
  const lockedPayout = calculateFixedOddsPayout(cappedAmount, impliedProbPct)

  // Check user has enough credits
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits, xp, username')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (profile.credits < cappedAmount) {
    return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
  }

  // Place the bet — payout locked at current odds, stored immediately
  const { data: bet, error: betError } = await supabase
    .from('bets')
    .insert({ user_id: user.id, market_id, side, amount: cappedAmount, payout: lockedPayout })
    .select()
    .single()

  if (betError) {
    if (betError.code === '23505') {
      return NextResponse.json({ error: 'Already bet on this market' }, { status: 409 })
    }
    console.error('[/api/bets] Insert error:', betError)
    return NextResponse.json({ error: betError.message ?? betError.details ?? JSON.stringify(betError) }, { status: 500 })
  }

  // Deduct credits + add XP — use admin client to bypass RLS on profiles
  const admin = createAdminClient()

  // Update pools (for live odds display), yes_percent, and engagement signals
  // Uses virtual liquidity for odds calculation — virtual pools absorb volatility
  const oldYesPercent = market.yes_percent ?? 50
  const newYesPool = (market.yes_pool ?? 0) + (side === 'yes' ? cappedAmount : 0)
  const newNoPool  = (market.no_pool  ?? 0) + (side === 'no'  ? cappedAmount : 0)
  const newHotScore = (market.hot_score ?? 0) + 1

  // Liquidity-adjusted odds: effective pools include decaying virtual depth
  const poolState: PoolState = {
    yes_pool:         newYesPool,
    no_pool:          newNoPool,
    virtual_yes_pool: market.virtual_yes_pool ?? 0,
    virtual_no_pool:  market.virtual_no_pool  ?? 0,
    hot_score:        newHotScore,
  }
  const newYesPercent = computeYesPercent(poolState)
  const momentumShift = Math.abs(newYesPercent - oldYesPercent)
  // Real user volume only (virtual pools excluded from total_credits)
  const newTotal = newYesPool + newNoPool

  await admin
    .from('markets')
    .update({
      yes_pool: newYesPool,
      no_pool: newNoPool,
      yes_percent: newYesPercent,
      total_credits: newTotal,
      hot_score: newHotScore,
      ...(momentumShift >= MOMENTUM_SHIFT_THRESHOLD && { momentum_shift: momentumShift }),
    })
    .eq('id', market.id)
  const { data: updated } = await admin
    .from('profiles')
    .update({ credits: profile.credits - cappedAmount, xp: profile.xp + XP_PER_BET })
    .eq('id', user.id)
    .select()
    .single()

  // Whale alert — fire-and-forget, never block the response
  if (cappedAmount >= WHALE_BET_THRESHOLD) {
    const sideLabel = side === 'yes' ? '✅ YES' : '❌ NO'
    const crAmount = (cappedAmount / 1000).toFixed(0) + 'K'
    void pushToMarketBettors(
      market_id,
      {
        title: '🐳 Whale Alert',
        body: `@${profile.username} just dropped ${crAmount} CR on ${sideLabel} — "${market.title}"`,
        url: '/',
      },
      user.id
    )
  }

  return NextResponse.json(
    { bet, profile: updated, cappedAmount },
    { status: 201 }
  )
  } catch (err) {
    console.error('[/api/bets] Unhandled error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
