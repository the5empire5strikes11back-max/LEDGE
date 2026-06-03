import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { rankFeed } from '@/lib/feed-ranker'
import { aggregateRecentBets } from '@/lib/social-signals'
import { seedLiquidity, type MarketCategory } from '@/lib/liquidity'
import { rateLimit, LIMITS } from '@/lib/rate-limit'

// Cache the full markets list for 30 seconds — same for all users
const getCachedMarkets = unstable_cache(
  async (category: string | null) => {
    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (admin as any).from('markets').select('*')
    if (category && category !== 'All') {
      query = query.eq('category', category)
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[]
  },
  ['markets'],
  { revalidate: 30, tags: ['markets'] }
)

// Cache the last-24h bets for social signals for 60 seconds — same for all users
const getCachedRecentBets = unstable_cache(
  async () => {
    const admin = createAdminClient()
    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
    const { data } = await admin
      .from('bets')
      .select('market_id, side, amount, created_at')
      .gte('created_at', dayAgo)
    return data ?? []
  },
  ['recent-bets'],
  { revalidate: 60, tags: ['recent-bets'] }
)

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cached queries (shared across all users) + user-specific queries run in parallel
  const [allMarkets, recentBetsData, userBetsResult, circleMembershipsResult] = await Promise.all([
    getCachedMarkets(category),
    getCachedRecentBets(),
    supabase
      .from('bets')
      .select('market_id, side, amount, payout, won')
      .eq('user_id', user.id),
    supabase
      .from('circle_members')
      .select('circle_id')
      .eq('user_id', user.id),
  ])

  const recentBetsResult = { data: recentBetsData }

  // Post-filter: hide queued/archived markets.
  // Pre-migration rows have no status field (undefined) and pass through as live.
  const markets = (allMarkets ?? []).filter((m) => {
    const s = (m as { status?: string }).status
    return !s || s === 'live'
  })

  // Build lookup structures
  const betMap = new Map(
    (userBetsResult.data ?? []).map((b) => [b.market_id, b])
  )
  const userCircleIds = new Set(
    (circleMembershipsResult.data ?? []).map((cm) => cm.circle_id)
  )

  // Aggregate recent bets into per-market social data (in-memory grouping, O(n) on bets)
  const socialMap = aggregateRecentBets(recentBetsResult.data ?? [])

  // Rank raw DB rows first (they have resolved: boolean, which the ranker needs)
  const rankedRaw = rankFeed(markets, userCircleIds)

  // Build a stable rank-order map so we can reorder the enriched output
  const rankOrder = new Map(rankedRaw.map((m, i) => [m.id, i]))

  // Enrich markets with client-facing aliases and derived fields
  const enriched = markets.map((market) => {
    const userBet = betMap.get(market.id)
    const isNearMiss =
      !!market.resolved &&
      (market.yes_percent ?? 50) >= 40 &&
      (market.yes_percent ?? 50) <= 60

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
      social: socialMap.get(market.id) ?? null,
    }
  })

  // Apply rank order with per-request random jitter so refreshing shows a new order.
  // Hot/featured markets are pinned to the top (no jitter). Everything else gets
  // ±3 position noise, keeping the feed feeling fresh without losing relevance.
  const jitterMap = new Map(
    enriched.map((m) => [m.id, (Math.random() - 0.5) * 6])
  )
  enriched.sort((a, b) => {
    const aIsHot = (a.hotScore ?? 0) >= 8 || a.isFeatured
    const bIsHot = (b.hotScore ?? 0) >= 8 || b.isFeatured
    if (aIsHot !== bIsHot) return aIsHot ? -1 : 1
    const aRank = (rankOrder.get(a.id) ?? 9999) + (aIsHot ? 0 : jitterMap.get(a.id)!)
    const bRank = (rankOrder.get(b.id) ?? 9999) + (bIsHot ? 0 : jitterMap.get(b.id)!)
    return aRank - bRank
  })

  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit — max 5 user-created markets per hour
  const adminForRl = createAdminClient()
  const rl = await rateLimit(adminForRl, { key: `${user.id}:marketsCreate`, ...LIMITS.marketsCreate })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many markets created. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  const body = await request.json()
  const { title, category, end_time, jackpot_pool } = body

  if (!title || !category || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Seed virtual liquidity for the new market
  const liquiditySeed = seedLiquidity(category as MarketCategory, false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('markets')
    .insert({
      title,
      category,
      end_time,
      jackpot_pool: jackpot_pool ?? 0,
      created_by: user.id,
      ...liquiditySeed,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
