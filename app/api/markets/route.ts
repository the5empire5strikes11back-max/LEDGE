import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unstable_cache, revalidatePath } from 'next/cache'
import { rankFeed, buildAffinityMap } from '@/lib/feed-ranker'
import { aggregateRecentBets } from '@/lib/social-signals'
import { seedLiquidity, type MarketCategory } from '@/lib/liquidity'
import { sellShares, seedReserves } from '@/lib/amm'
import { rateLimit, LIMITS } from '@/lib/rate-limit'
import { validateMarketTitle, validateEndTime } from '@/lib/validate'
import { inferInterestsFromBets, mergeInterests } from '@/lib/interest-tags'
import { screenMarket, ALLOWED_CATEGORIES } from '@/lib/market-quality'
import { validateMarket } from '@/lib/market-validation'
import { computeCreatorTrust, batchCreatorTrust } from '@/lib/creator-trust'
import { canAccessCircleMarket } from '@/lib/circle-access'
import { logMessage } from '@/lib/logger'

// Cache the full markets list for 30 seconds — same for all users
const getCachedMarkets = unstable_cache(
  async (category: string | null) => {
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (admin as any)
      .from('markets')
      .select('*')
      .or('status.eq.live,status.is.null')  // live markets only — queued/archived excluded at DB level
      .gt('end_time', nowIso)               // exclude expired markets before they're archived
    if (category && category !== 'All') {
      query = query.eq('category', category)
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []) as any[]
  },
  ['markets-v2'],
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
  // No auth guard — guests can view the public feed

  const noData = Promise.resolve({ data: null })

  // Cached queries (shared across all users) + user-specific queries run in parallel
  const [allMarkets, recentBetsData, userBetsResult, circleMembershipsResult, profileResult, autoBetsResult] = await Promise.all([
    getCachedMarkets(category),
    getCachedRecentBets(),
    user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
          .from('bets')
          .select('market_id, side, amount, payout, shares, won, markets(title, category)')
          .eq('user_id', user.id) as Promise<{ data: Array<{
            market_id: string
            side: string
            amount: number
            payout: number | null
            shares: number | null
            won: boolean | null
            markets: { title: string; category: string } | null
          }> | null }>
      : noData,
    user
      ? supabase.from('circle_members').select('circle_id').eq('user_id', user.id)
      : noData,
    user
      ? supabase.from('profiles').select('interests').eq('id', user.id).single()
      : noData,
    user
      // Pending auto-bets so the feed can show an armed trigger on a market.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
          .from('auto_bets')
          .select('id, market_id, side, target_percent, amount')
          .eq('user_id', user.id)
          .eq('status', 'pending') as Promise<{ data: Array<{
            id: string; market_id: string; side: string; target_percent: number; amount: number
          }> | null }>
      : noData,
  ])

  const recentBetsResult = { data: recentBetsData }

  // Circle IDs the user belongs to — used to gate private circle markets.
  const userCircleIds = new Set(
    (circleMembershipsResult.data ?? []).map((cm) => cm.circle_id)
  )

  // Post-filter: hide queued/archived markets, hide expired unresolved markets,
  // and hide PRIVATE circle markets the user is not a member of.
  // Pre-migration rows have no status field (undefined) and pass through as live.
  // Expired unresolved markets are excluded here so they never render as live
  // bettable cards between cron runs — resolve-expired archives them asynchronously.
  const nowIso = new Date().toISOString()
  const markets = (allMarkets ?? []).filter((m) => {
    const s = (m as { status?: string }).status
    if (s && s !== 'live') return false
    // Hide expired unresolved markets — stale events should never show as live
    if (!m.resolved && m.end_time && m.end_time < nowIso) return false
    // Circle markets are private — only members of the circle may see them
    if (!canAccessCircleMarket(m.circle_id, userCircleIds)) return false
    return true
  })

  // Build lookup structures
  const betMap = new Map(
    (userBetsResult.data ?? []).map((b) => [b.market_id, b])
  )
  const autoBetMap = new Map(
    (autoBetsResult?.data ?? []).map((a) => [a.market_id, a])
  )

  // Batch-fetch creator usernames + trust scores for user-created markets
  const creatorIds = [...new Set(
    markets.filter((m) => m.created_by).map((m) => m.created_by as string)
  )]
  const adminForCreators = createAdminClient()
  const [creatorProfilesResult, creatorTrustMap] = await Promise.all([
    creatorIds.length > 0
      ? adminForCreators.from('profiles').select('id, username').in('id', creatorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; username: string }> }),
    batchCreatorTrust(creatorIds, adminForCreators),
  ])
  const creatorMap = new Map((creatorProfilesResult.data ?? []).map((p: { id: string; username: string }) => [p.id, p.username]))

  // Aggregate recent bets into per-market social data (in-memory grouping, O(n) on bets)
  const socialMap = aggregateRecentBets(recentBetsResult.data ?? [])

  // Build interest list: merge quiz-set interests with interests inferred from bets
  const quizInterests: string[] = (profileResult.data?.interests ?? []) as string[]
  const betHistoryForInference = (userBetsResult.data ?? []).map((b) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markets: (b as any).markets as { title: string } | null,
  }))
  const inferredInterests = inferInterestsFromBets(betHistoryForInference)
  const userInterests = mergeInterests(quizInterests, inferredInterests)

  // Build category affinity map from bet history (existing signal)
  const affinityMap = buildAffinityMap(
    (userBetsResult.data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => ({ category: ((b as any).markets as { category?: string } | null)?.category ?? '' }))
      .filter((b) => b.category)
  )

  // Attach creator_trust to raw market rows so the ranker can apply the signal
  const marketsWithTrust = markets.map((m) => ({
    ...m,
    creator_trust: m.created_by ? (creatorTrustMap.get(m.created_by)?.score ?? null) : null,
  }))

  // Rank raw DB rows first (they have resolved: boolean, which the ranker needs)
  const rankedRaw = rankFeed(marketsWithTrust, userCircleIds, affinityMap, userInterests)

  // Build a stable rank-order map so we can reorder the enriched output
  const rankOrder = new Map(rankedRaw.map((m, i) => [m.id, i]))

  // Enrich markets with client-facing aliases and derived fields
  const enriched = markets.map((market) => {
    const userBet = betMap.get(market.id)
    const autoBet = autoBetMap.get(market.id)
    const isNearMiss =
      !!market.resolved &&
      (market.yes_percent ?? 50) >= 40 &&
      (market.yes_percent ?? 50) <= 60

    // Compute the AI-set opening probability from the virtual pools.
    // virtual_yes_pool / (virtual_yes_pool + virtual_no_pool) gives the exact
    // starter_probability that was embedded at generation time — unaffected by real bets.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = market as any
    const vYes = typeof m.virtual_yes_pool === 'number' ? m.virtual_yes_pool : 0
    const vNo  = typeof m.virtual_no_pool  === 'number' ? m.virtual_no_pool  : 0
    const openingYesPercent =
      vYes + vNo > 0
        ? Math.round((vYes / (vYes + vNo)) * 100)
        : (market.yes_percent ?? 50)

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
      /** AI-set opening odds — used to seed the sparkline history anchor */
      openingYesPercent,
      resolved: market.resolved ? {
        winner: market.winner,
        note: market.resolution_note ?? null,
        sourceUrl: market.resolution_source_display ?? market.resolution_source_url ?? null,
        resolvedAt: market.resolved_at ?? null,
      } : undefined,
      resolutionCriteria: market.resolution_criteria ?? null,
      /** Creator-resolution (subjective markets): mode + proposal + viewer-is-creator. */
      resolutionMode: (market as { resolution_mode?: string }).resolution_mode ?? 'auto',
      creatorProposedWinner: (market as { creator_proposed_winner?: string | null }).creator_proposed_winner ?? null,
      creatorResolvedAt: (market as { creator_resolved_at?: string | null }).creator_resolved_at ?? null,
      isCreator: !!user && !!market.created_by && market.created_by === user.id,
      /** User-coined category label shown in place of the system category */
      subcategory: market.subcategory ?? null,
      /** Pre-resolution source URL — used for "Resolves via …" chip on cards */
      resolutionSourceUrl: market.resolution_source_url ?? null,
      /** Raw JSON resolution key — used to derive source label & type */
      targetDataKey: market.target_data_key ?? null,
      /** Multi-option grouping — null for standalone Yes/No markets */
      groupId: market.group_id ?? null,
      groupLabel: market.group_label ?? null,
      optionLabel: market.option_label ?? null,
      groupType: market.group_type ?? 'yes_no',
      groupExclusive: market.group_exclusive ?? true,
      userBet: userBet ? {
        side: userBet.side,
        amount: userBet.amount,
        payout: userBet.payout ?? null,
        /** Shares held = locked max payout (each winning share pays 1 credit) */
        shares: userBet.shares ?? userBet.payout ?? null,
        /**
         * Live cash-out value right now — computed with the SAME sellShares the
         * cash-out endpoint executes, so the previewed "Worth now" equals the
         * credited amount exactly (no drift). Not a naive shares×price mark.
         */
        value: (() => {
          const held = userBet.shares ?? userBet.payout
          if (held == null || market.resolved) return null
          const reserves = m.yes_shares != null && m.no_shares != null
            ? { y: m.yes_shares as number, n: m.no_shares as number }
            : seedReserves((market.yes_percent ?? 50) / 100, Math.max(6000, vYes + vNo + (market.total_credits ?? 0)))
          return sellShares(reserves, userBet.side as 'yes' | 'no', held).credits
        })(),
      } : undefined,
      /** Armed auto-bet trigger on this market, if any (Phase 2). */
      autoBet: autoBet ? {
        id: autoBet.id,
        side: autoBet.side,
        targetPercent: autoBet.target_percent,
        amount: autoBet.amount,
      } : undefined,
      social: socialMap.get(market.id) ?? null,
      /** Username of the person who created this market (null for AI-generated) */
      creatorUsername: market.created_by ? (creatorMap.get(market.created_by) ?? null) : null,
      /** Creator trust score [0.1, 0.95] — null for AI-generated markets */
      creatorTrust: market.created_by ? (creatorTrustMap.get(market.created_by)?.score ?? null) : null,
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

  // Rate limit — max 3 user-created markets per hour
  const admin = createAdminClient()
  const rl = await rateLimit(admin, { key: `${user.id}:marketsCreate`, ...LIMITS.marketsCreate })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many markets created. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  const body = await request.json()
  const { title, category, end_time } = body

  // ── Basic field presence ──────────────────────────────────────────────────
  if (!title || typeof title !== 'string' || !category || !end_time) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const titleValidation = validateMarketTitle(title)
  if (!titleValidation.ok) {
    return NextResponse.json({ error: titleValidation.error }, { status: 400 })
  }
  const trimmedTitle = (title as string).trim()

  const endTimeValidation = validateEndTime(end_time)
  if (!endTimeValidation.ok) {
    return NextResponse.json({ error: endTimeValidation.error }, { status: 400 })
  }

  // Strict temporal/anchor/staleness gate — same validator the AI path uses.
  // (requireResolution is off: user markets get their resolution path downstream.)
  const temporal = validateMarket({
    title: trimmedTitle,
    endTimeIso: new Date(end_time).toISOString(),
  })
  if (!temporal.valid) {
    return NextResponse.json({ error: temporal.reason }, { status: 422 })
  }

  // ── Category allowlist (server-side) ─────────────────────────────────────
  if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  // ── Optional custom subcategory ──────────────────────────────────────────
  // A user-coined category label. The market still belongs to a real system
  // category (the client sends "Wild" for custom), so liquidity, floors, and
  // ranking are unaffected; the label is shown in place of the category on cards.
  let subcategory: string | null = null
  if (body.subcategory != null && body.subcategory !== '') {
    if (typeof body.subcategory !== 'string') {
      return NextResponse.json({ error: 'Invalid custom category' }, { status: 400 })
    }
    const cleaned = body.subcategory.trim().replace(/\s+/g, ' ')
    if (cleaned.length < 2 || cleaned.length > 20) {
      return NextResponse.json({ error: 'Custom category must be 2–20 characters' }, { status: 400 })
    }
    if (!/^[\p{L}\p{N} &-]+$/u.test(cleaned)) {
      return NextResponse.json({ error: 'Custom category: letters, numbers, spaces, & and - only' }, { status: 400 })
    }
    subcategory = cleaned
  }

  // ── Fetch creator trust + existing titles in parallel ────────────────────
  const [trustResult, existingMarketsResult] = await Promise.all([
    computeCreatorTrust(user.id, admin),
    admin
      .from('markets')
      .select('title')
      .in('status', ['live', 'queued', 'review'])
      .gt('end_time', new Date().toISOString()),
  ])
  const existingTitles = (existingMarketsResult.data ?? []).map((m: { title: string }) => m.title)

  // ── Quality screening (safety, clarity, duplicates, spam, trust) ──────────
  const screen = screenMarket({
    title: trimmedTitle,
    category,
    endTimeIso: new Date(end_time).toISOString(),
    existingTitles,
    creatorTrust: trustResult.score,
  })

  logMessage(
    `[market-quality] user=${user.id} trust=${trustResult.score.toFixed(2)} tier=${trustResult.tier} verdict=${screen.verdict} flags=[${screen.flags.join(',')}] title="${trimmedTitle.slice(0, 60)}"`,
    { context: 'markets:POST' }
  )

  if (screen.verdict === 'reject') {
    return NextResponse.json({ error: screen.reason }, { status: 422 })
  }

  // review → hidden from feed until manually approved; accept → live immediately
  const status = screen.verdict === 'review' ? 'review' : 'live'
  const liquiditySeed = seedLiquidity(category as MarketCategory, false)

  // Subjective markets: the creator settles the outcome at close (held through a
  // dispute window). Default is 'auto' (source/AI resolution, creator locked out).
  const resolutionMode = body.resolution_mode === 'creator' ? 'creator' : 'auto'

  // Insert via the service-role client. Direct market inserts are revoked for
  // the authenticated role — otherwise a user could bypass all the validation
  // above (quality screening, rate limit, category allowlist) by writing to the
  // markets table directly. created_by is pinned to the verified session.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('markets')
    .insert({
      title: trimmedTitle,
      category,
      ...(subcategory ? { subcategory } : {}),
      end_time,
      jackpot_pool: 0,
      created_by: user.id,
      status,
      published_at: status === 'live' ? new Date().toISOString() : null,
      resolution_mode: resolutionMode,
      ...liquiditySeed,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Bust the shared feed cache so live markets appear on next load
  if (status === 'live') {
    revalidatePath('/', 'layout')
  }

  return NextResponse.json(
    {
      ...data,
      _review: screen.verdict === 'review',
      _reviewReason: screen.verdict === 'review' ? screen.reason : undefined,
    },
    { status: 201 }
  )
}
