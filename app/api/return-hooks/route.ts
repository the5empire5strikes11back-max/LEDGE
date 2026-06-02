import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export interface ReturnHook {
  type: "resolves_soon" | "winning" | "sentiment_shifted" | "close_call"
  marketId: string
  title: string
  endTime: string
  userSide: "yes" | "no"
  currentOdds: number
  label: string
  urgent: boolean
}

export async function GET() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // Fetch open bets with market context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawBets } = await (supabase as any)
    .from('bets')
    .select('side, amount, markets(id, title, end_time, yes_percent, momentum_shift, resolved, circle_id)')
    .eq('user_id', user.id)
    .is('won', null)
    .limit(50)

  type BetRow = {
    side: string
    amount: number
    markets: {
      id: string
      title: string
      end_time: string
      yes_percent: number
      momentum_shift: number | null
      resolved: boolean
      circle_id: string | null
    } | null
  }

  const bets = (rawBets ?? []) as BetRow[]
  if (bets.length === 0) return NextResponse.json([])

  const hooks: ReturnHook[] = []
  const nowMs = Date.now()
  const seenMarkets = new Set<string>()

  for (const bet of bets) {
    const market = bet.markets
    if (!market || market.resolved) continue

    const hoursLeft = (new Date(market.end_time).getTime() - nowMs) / 3_600_000
    if (hoursLeft < 0) continue // expired, awaiting resolution

    const userSide = bet.side as "yes" | "no"
    const currentOdds = market.yes_percent
    const userOdds = userSide === "yes" ? currentOdds : 100 - currentOdds
    const momentum = market.momentum_shift ?? 0
    // Positive means YES side gaining; negative means NO side gaining
    const momentumAgainstUser = userSide === "yes" ? -momentum : momentum

    // ── "Resolves soon" — closes within 4 hours ─────────────────────────────
    if (hoursLeft < 4 && !seenMarkets.has(`soon:${market.id}`)) {
      seenMarkets.add(`soon:${market.id}`)
      const mins = Math.round(hoursLeft * 60)
      hooks.push({
        type: "resolves_soon",
        marketId: market.id,
        title: market.title,
        endTime: market.end_time,
        userSide,
        currentOdds,
        label: hoursLeft < 1 ? `Resolves in ${mins}m` : `Resolves in ${Math.floor(hoursLeft)}h`,
        urgent: hoursLeft < 1,
      })
    }

    // ── "Winning" — user is on the leading side ──────────────────────────────
    if (userOdds >= 60 && !seenMarkets.has(`winning:${market.id}`)) {
      seenMarkets.add(`winning:${market.id}`)
      hooks.push({
        type: "winning",
        marketId: market.id,
        title: market.title,
        endTime: market.end_time,
        userSide,
        currentOdds,
        label: `Leading at ${userOdds}% — you're winning`,
        urgent: false,
      })
    }

    // ── "Sentiment shifted" — crowd moved against user ───────────────────────
    if (momentumAgainstUser >= 8 && !seenMarkets.has(`shifted:${market.id}`)) {
      seenMarkets.add(`shifted:${market.id}`)
      hooks.push({
        type: "sentiment_shifted",
        marketId: market.id,
        title: market.title,
        endTime: market.end_time,
        userSide,
        currentOdds,
        label: `Crowd shifted ${Math.round(momentumAgainstUser)}% against your ${userSide.toUpperCase()}`,
        urgent: true,
      })
    }

    // ── "Close call" — market is within 8% of 50/50 (maximum tension zone) ──
    // A bet sitting near coin-flip odds is the most emotionally loaded state.
    // Show this when neither "winning" nor "sentiment_shifted" already fired for
    // this market so we don't double-chip the same market.
    const isNear5050 = currentOdds >= 42 && currentOdds <= 58
    if (
      isNear5050 &&
      !seenMarkets.has(`winning:${market.id}`) &&
      !seenMarkets.has(`shifted:${market.id}`) &&
      !seenMarkets.has(`close_call:${market.id}`)
    ) {
      seenMarkets.add(`close_call:${market.id}`)
      hooks.push({
        type: "close_call",
        marketId: market.id,
        title: market.title,
        endTime: market.end_time,
        userSide,
        currentOdds,
        label: `${currentOdds}% YES — too close to call`,
        urgent: false,
      })
    }
  }

  // Prioritise: urgent first, then resolves_soon > sentiment > close_call > winning
  const order: Record<ReturnHook["type"], number> = {
    resolves_soon: 0,
    sentiment_shifted: 1,
    close_call: 2,
    winning: 3,
  }
  hooks.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
    return order[a.type] - order[b.type]
  })

  return NextResponse.json(hooks.slice(0, 5))
}
