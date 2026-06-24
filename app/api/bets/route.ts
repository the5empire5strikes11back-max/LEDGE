import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { XP_PER_BET, CIRCLE_BET_MAX_CR, WHALE_BET_THRESHOLD, MOMENTUM_SHIFT_THRESHOLD } from '@/lib/game-engine'
import { pushToMarketBettors } from '@/lib/push'
import { buyShares, yesPercent as ammYesPercent, seedReserves, type Reserves } from '@/lib/amm'
import { fireEligibleAutoBets } from '@/lib/auto-bet-trigger'
import { rateLimit, LIMITS } from '@/lib/rate-limit'
import { validateBetAmount } from '@/lib/validate'
import { logError } from '@/lib/logger'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bets')
    .select('*, markets(title, category, resolved, winner)')
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

  // Rate limit — max 8 bets per 30 seconds
  const admin = createAdminClient()
  const rl = await rateLimit(admin, { key: `${user.id}:bets`, ...LIMITS.bets })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many bets. Slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  const body = await request.json()
  const { market_id, side, amount } = body as {
    market_id?: string
    side?: 'yes' | 'no'
    amount?: number
  }

  if (!market_id || typeof market_id !== 'string' || !side || !['yes','no'].includes(side) || !amount) {
    return NextResponse.json({ error: 'Invalid bet data' }, { status: 400 })
  }
  const amountValidation = validateBetAmount(amount)
  if (!amountValidation.ok) {
    return NextResponse.json({ error: amountValidation.error }, { status: 400 })
  }
  // amount is now validated and defined
  const safeAmount = amount as number

  // Fetch market — include virtual pools for liquidity-aware odds calculation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: market, error: marketError } = await (supabase as any)
    .from('markets')
    .select('id, title, resolved, end_time, circle_id, yes_pool, no_pool, yes_percent, total_credits, hot_score, virtual_yes_pool, virtual_no_pool, yes_shares, no_shares, created_by, group_type')
    .eq('id', market_id)
    .single() as { data: {
      id: string; title: string; resolved: boolean; end_time: string
      circle_id: string | null; yes_pool: number; no_pool: number
      yes_percent: number; total_credits: number; hot_score: number
      virtual_yes_pool: number; virtual_no_pool: number
      yes_shares: number | null; no_shares: number | null
      created_by: string | null; group_type: string | null
    } | null, error: unknown }

  if (marketError) {
    const errMsg = (marketError as { message?: string })?.message ?? JSON.stringify(marketError)
    console.error('[/api/bets] Market fetch error:', marketError)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
  if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  if (market.group_type === 'poll') {
    return NextResponse.json({ error: 'Polls are voted on, not bet on' }, { status: 400 })
  }
  if (market.resolved || new Date(market.end_time) < new Date()) {
    return NextResponse.json({ error: 'Market is closed' }, { status: 400 })
  }

  // Private circle markets: only members of the circle may bet. Without this
  // check, a non-member who learns a circle market's ID could place bets on it.
  if (market.circle_id) {
    const { data: membership } = await admin
      .from('circle_members')
      .select('circle_id')
      .eq('circle_id', market.circle_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }
  }

  // Anti-Sybil: cap bets inside user-created Circle markets
  const cappedAmount = market.circle_id ? Math.min(safeAmount, CIRCLE_BET_MAX_CR) : safeAmount

  // CPMM buy: spend credits → receive shares of the chosen side at the current
  // curve price. The share count is locked here (the "max payout" — each winning
  // share pays 1 credit), while its live value floats with the market. Reserves
  // are seeded from current odds if a market predates the AMM migration.
  const reservesBefore: Reserves =
    market.yes_shares != null && market.no_shares != null
      ? { y: market.yes_shares, n: market.no_shares }
      : seedReserves(
          (market.yes_percent ?? 50) / 100,
          Math.max(6000, (market.virtual_yes_pool ?? 0) + (market.virtual_no_pool ?? 0) + (market.total_credits ?? 0))
        )
  const { shares: lockedShares, reserves: reservesAfter } = buyShares(reservesBefore, side, cappedAmount)
  // Mirror shares into `payout` for backward compatibility (settlement/cash-out
  // read shares, falling back to payout for legacy rows).
  const lockedPayout = lockedShares

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

  // Place the bet — payout locked at current odds, stored immediately.
  // Written via the service-role client: direct bet inserts are revoked for the
  // authenticated role, otherwise a user could insert a fake winning bet with a
  // client-chosen payout (resolution trusts the stored payout). user_id is
  // pinned to the verified session.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bet, error: betError } = await (admin as any)
    .from('bets')
    .insert({ user_id: user.id, market_id, side, amount: cappedAmount, payout: lockedPayout, shares: lockedShares })
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
  // (admin client already created above for rate limiting)

  // Odds now come straight from the CPMM reserves after the buy — price is truly
  // continuous (every trade moves the curve). yes_pool/no_pool stay as a running
  // tally of real user volume for stats; the AMM reserves are authoritative.
  const oldYesPercent = market.yes_percent ?? 50
  const newYesPool = (market.yes_pool ?? 0) + (side === 'yes' ? cappedAmount : 0)
  const newNoPool  = (market.no_pool  ?? 0) + (side === 'no'  ? cappedAmount : 0)
  const newHotScore = (market.hot_score ?? 0) + 1
  const newYesPercent = ammYesPercent(reservesAfter)
  const momentumShift = Math.abs(newYesPercent - oldYesPercent)
  const newTotal = newYesPool + newNoPool

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('markets')
    .update({
      yes_pool: newYesPool,
      no_pool: newNoPool,
      yes_shares: reservesAfter.y,
      no_shares: reservesAfter.n,
      yes_percent: newYesPercent,
      total_credits: newTotal,
      hot_score: newHotScore,
      ...(momentumShift >= MOMENTUM_SHIFT_THRESHOLD && { momentum_shift: momentumShift }),
    })
    .eq('id', market.id)
  // Invalidate the cached feed so the live position value reflects the new
  // reserves immediately — keeps the cash-out preview in step with execution.
  revalidatePath('/', 'layout')
  // This trade may have pushed the price into someone's auto-bet target.
  await fireEligibleAutoBets(admin, market.id)
  const { data: updated } = await admin
    .from('profiles')
    .update({ credits: profile.credits - cappedAmount, xp: profile.xp + XP_PER_BET })
    .eq('id', user.id)
    .select()
    .single()

  // Prediction streak — if the user hasn't placed a bet today yet, advance their streak
  // (fire-and-forget; never blocks the response)
  void (async () => {
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      // Count bets placed *today* excluding the one we just inserted
      const { count } = await admin
        .from('bets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString())
        .neq('id', bet.id)

      // If this is the first bet today, advance the streak
      if ((count ?? 0) === 0) {
        const { data: prof } = await admin
          .from('profiles')
          .select('streak, last_active_at')
          .eq('id', user.id)
          .single()

        if (prof) {
          const lastActive = new Date(prof.last_active_at ?? 0)
          const hoursSince = (Date.now() - lastActive.getTime()) / 3_600_000
          const newStreak = hoursSince <= 48 ? (prof.streak ?? 0) + 1 : 1

          await admin
            .from('profiles')
            .update({ streak: newStreak, last_active_at: new Date().toISOString() })
            .eq('id', user.id)
        }
      }
    } catch {
      // Non-critical — streak is best-effort
    }
  })()

  // Creator XP reward — fire-and-forget (+15 XP when someone bets your market)
  if (market.created_by && market.created_by !== user.id) {
    const creatorId = market.created_by
    void (async () => {
      try {
        const { data: cp } = await admin
          .from('profiles')
          .select('xp')
          .eq('id', creatorId)
          .single()
        if (cp) {
          await admin
            .from('profiles')
            .update({ xp: cp.xp + 15 })
            .eq('id', creatorId)
        }
      } catch {
        // Non-critical — creator XP is best-effort
      }
    })()
  }

  // Odds shift alert — notify other bettors when odds move 10%+ (but not for whale bets, handled below)
  const ODDS_SHIFT_THRESHOLD = 10
  if (momentumShift >= ODDS_SHIFT_THRESHOLD && cappedAmount < WHALE_BET_THRESHOLD) {
    const direction = newYesPercent > oldYesPercent ? '⬆️' : '⬇️'
    const shortTitle = market.title.length > 45 ? market.title.slice(0, 42) + '…' : market.title
    void pushToMarketBettors(
      market_id,
      {
        title: `${direction} Odds shifted ${momentumShift.toFixed(0)}%`,
        body: `"${shortTitle}" — YES now at ${newYesPercent.toFixed(0)}%`,
        url: '/',
      },
      user.id
    )
    // In-app notifications for all existing bettors (fire-and-forget)
    void (async () => {
      try {
        const { data: existingBets } = await admin
          .from('bets')
          .select('user_id')
          .eq('market_id', market_id)
          .neq('user_id', user.id)
        const uniqueUserIds = [...new Set((existingBets ?? []).map((b: { user_id: string }) => b.user_id))]
        if (uniqueUserIds.length > 0) {
          const notifs = uniqueUserIds.map((uid) => ({
            user_id: uid,
            type: 'odds_shift',
            title: `${direction} Odds shifted ${momentumShift.toFixed(0)}%`,
            body: `"${shortTitle}" — YES now at ${newYesPercent.toFixed(0)}%`,
            url: '/',
          }))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any).from('notifications').insert(notifs)
        }
      } catch {
        // Non-critical — notification is best-effort
      }
    })()
  }

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
    logError(err, { context: 'bets:POST' })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
