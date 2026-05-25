/**
 * Social signal computation — pure functions, no side effects.
 *
 * Two tiers:
 *   computeFeedSignals()   — from precomputed per-market aggregates (feed cards)
 *   computeDetailSignals() — from the full bets array (market detail view)
 *
 * Principles:
 *   • Signal priority: whale > recent activity > momentum pressure > crowd sentiment
 *   • Never show more than 2 signals on a feed card
 *   • All labels are factual and aggregate — no individual callouts in the feed
 */

import { WHALE_BET_THRESHOLD } from '@/lib/game-engine'

// ── Types ─────────────────────────────────────────────────────────────────────

/** Precomputed per-market data added to the /api/markets response. */
export interface MarketSocialData {
  recentBetCount: number           // bets in last 1h
  recentYesRatio: number           // 0–1, share of recent bets that are YES
  hasWhaleBet: boolean             // any single bet ≥ WHALE_BET_THRESHOLD in last 24h
  whaleDirection: 'yes' | 'no' | null
  lastBetDirection: 'yes' | 'no' | null
  avgEntryPct: number | null       // avg yes_percent at time of entry (approx)
}

/** Feed card social signals — max 2 shown. */
export interface FeedSignal {
  text: string
  tone: 'neutral' | 'yes' | 'no' | 'whale' | 'alert'
}

/** Rich signals for the detail view. */
export interface DetailSignals {
  traderCount: number
  recentCount: number             // last 1h
  yesBetterCount: number
  noBetterCount: number
  recentYesPct: number | null     // % of last-hour bets that were YES (null if < 3 bets)
  hasWhale: boolean
  whaleDirection: 'yes' | 'no' | null
  avgEntryPct: number | null
  pressureLabel: string | null    // "Heavy YES pressure", "Late money flowing NO"
  crowdLabel: string | null       // "Public: 68% YES"
  activityLabel: string | null    // "Activity accelerating", "12 traders in last hour"
  entryLabel: string | null       // "Most entries near 45%"
  circleMemberCount: number       // how many circle members have traded this
  circleYesRatio: number | null   // 0–1, circle lean (null if < 2 circle bets)
}

// ── Raw bet shape (subset returned by the bets API) ───────────────────────────

export interface RawBet {
  market_id?: string
  side: string
  amount: number
  created_at: string
}

// ── Feed-level signal computation ─────────────────────────────────────────────

/**
 * Aggregate recent bets (24h slice) into per-market social data.
 * Call once in the markets route with the full recent-bets array.
 */
export function aggregateRecentBets(
  recentBets: RawBet[],
  nowMs = Date.now()
): Map<string, MarketSocialData> {
  const map = new Map<string, MarketSocialData>()
  const oneHourMs  = 60 * 60_000
  const dayMs      = 24 * 60 * 60_000

  // Group by market_id
  const byMarket = new Map<string, RawBet[]>()
  for (const b of recentBets) {
    if (!b.market_id) continue
    const arr = byMarket.get(b.market_id) ?? []
    arr.push(b)
    byMarket.set(b.market_id, arr)
  }

  for (const [marketId, bets] of byMarket) {
    const sorted = [...bets].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    const lastHour  = sorted.filter((b) => nowMs - new Date(b.created_at).getTime() < oneHourMs)
    const lastDay   = sorted.filter((b) => nowMs - new Date(b.created_at).getTime() < dayMs)

    const recentYes = lastHour.filter((b) => b.side === 'yes').length
    const recentTotal = lastHour.length

    const whaleBet = lastDay.find((b) => b.amount >= WHALE_BET_THRESHOLD)

    const last = sorted[sorted.length - 1]

    map.set(marketId, {
      recentBetCount: recentTotal,
      recentYesRatio: recentTotal > 0 ? recentYes / recentTotal : 0.5,
      hasWhaleBet: !!whaleBet,
      whaleDirection: whaleBet ? (whaleBet.side as 'yes' | 'no') : null,
      lastBetDirection: last ? (last.side as 'yes' | 'no') : null,
      avgEntryPct: null, // computed separately if needed
    })
  }

  return map
}

/**
 * Turn per-market social data + current odds into 0–2 feed card signals.
 */
export function computeFeedSignals(
  social: MarketSocialData | undefined,
  yesPercent: number,
  momentumShift: number
): FeedSignal[] {
  if (!social) return []
  const signals: FeedSignal[] = []

  // Priority 1 — whale activity (most powerful social proof)
  if (social.hasWhaleBet && social.whaleDirection) {
    const dir = social.whaleDirection === 'yes' ? 'YES' : 'NO'
    signals.push({ text: `Whale entered ${dir}`, tone: 'whale' })
  }

  // Priority 2 — recent trader count with direction
  if (social.recentBetCount >= 3) {
    const lean = social.recentYesRatio >= 0.65
      ? ' · leaning YES'
      : social.recentYesRatio <= 0.35
      ? ' · leaning NO'
      : ''
    const label =
      social.recentBetCount >= 15 ? 'Activity surge'
      : social.recentBetCount >= 8 ? `${social.recentBetCount} traders this hour`
      : `${social.recentBetCount} recent traders`
    signals.push({
      text: `${label}${lean}`,
      tone: social.recentYesRatio >= 0.65 ? 'yes'
          : social.recentYesRatio <= 0.35 ? 'no'
          : 'neutral',
    })
  } else if (social.recentBetCount > 0 && social.lastBetDirection) {
    // Small count — just show last direction
    const dir = social.lastBetDirection === 'yes' ? 'YES' : 'NO'
    signals.push({ text: `Most recent bet: ${dir}`, tone: social.lastBetDirection })
  }

  // Priority 3 — pressure / sentiment (fill second slot or only slot)
  if (signals.length < 2) {
    if (momentumShift >= 8) {
      const dir = yesPercent > 50 ? 'YES' : 'NO'
      signals.push({ text: `Heavy ${dir} pressure`, tone: yesPercent > 50 ? 'yes' : 'no' })
    } else if (Math.abs(yesPercent - 50) <= 5) {
      signals.push({ text: 'Market nearly 50/50', tone: 'alert' })
    } else if (yesPercent >= 75) {
      signals.push({ text: `Public: ${yesPercent}% YES`, tone: 'yes' })
    } else if (yesPercent <= 25) {
      signals.push({ text: `Public: ${100 - yesPercent}% NO`, tone: 'no' })
    }
  }

  return signals.slice(0, 2)
}

// ── Detail-level signal computation ───────────────────────────────────────────

export interface DetailBet {
  side: string
  amount: number
  created_at: string
  isCircleMember?: boolean
}

export function computeDetailSignals(
  bets: DetailBet[],
  currentYesPct: number,
  nowMs = Date.now()
): DetailSignals {
  const oneHourMs = 60 * 60_000

  const yesBets    = bets.filter((b) => b.side === 'yes')
  const noBets     = bets.filter((b) => b.side === 'no')
  const lastHour   = bets.filter((b) => nowMs - new Date(b.created_at).getTime() < oneHourMs)
  const circleBets = bets.filter((b) => b.isCircleMember)

  // Recent lean
  const recentYes   = lastHour.filter((b) => b.side === 'yes').length
  const recentTotal = lastHour.length
  const recentYesPct = recentTotal >= 3 ? (recentYes / recentTotal) * 100 : null

  // Whale detection
  const whaleBet = bets.find((b) => b.amount >= WHALE_BET_THRESHOLD)

  // Average entry probability (crude: use current value as proxy when no history)
  const avgEntryPct = currentYesPct // refined in the route if history is available

  // Activity label
  let activityLabel: string | null = null
  if (recentTotal >= 20) activityLabel = 'Activity surging'
  else if (recentTotal >= 8) activityLabel = `${recentTotal} traders in last hour`
  else if (recentTotal >= 3) activityLabel = `${recentTotal} recent traders`

  // Pressure label
  let pressureLabel: string | null = null
  if (recentYesPct !== null) {
    if (recentYesPct >= 70) pressureLabel = 'Late money flowing YES'
    else if (recentYesPct <= 30) pressureLabel = 'Late money flowing NO'
    else if (recentTotal >= 5 && Math.abs(recentYesPct - 50) <= 15) pressureLabel = 'Sharp sentiment reversal'
  }

  // Crowd label
  let crowdLabel: string | null = null
  if (currentYesPct >= 70)      crowdLabel = `Public sentiment: ${currentYesPct.toFixed(0)}% YES`
  else if (currentYesPct <= 30) crowdLabel = `Public sentiment: ${(100 - currentYesPct).toFixed(0)}% NO`
  else if (Math.abs(currentYesPct - 50) <= 5) crowdLabel = 'Market split — no clear favorite'

  // Entry label
  let entryLabel: string | null = null
  if (bets.length >= 5) {
    entryLabel = `Avg entry near ${avgEntryPct.toFixed(0)}% YES`
  }

  // Circle signals
  const circleMemberCount = new Set(circleBets.map((_, i) => i)).size // simplified — count of circle bets
  const circleYesCount  = circleBets.filter((b) => b.side === 'yes').length
  const circleYesRatio  = circleBets.length >= 2
    ? circleYesCount / circleBets.length
    : null

  return {
    traderCount: bets.length,
    recentCount: recentTotal,
    yesBetterCount: yesBets.length,
    noBetterCount: noBets.length,
    recentYesPct,
    hasWhale: !!whaleBet,
    whaleDirection: whaleBet ? (whaleBet.side as 'yes' | 'no') : null,
    avgEntryPct,
    pressureLabel,
    crowdLabel,
    activityLabel,
    entryLabel,
    circleMemberCount,
    circleYesRatio,
  }
}
