/**
 * Feed Ranking System
 *
 * Computes a composite rank score for every unresolved market so the feed
 * feels alive, urgent, and socially relevant — not chronological.
 *
 * Architecture:
 *   Each signal is independently normalized to [0, 1], then multiplied by
 *   its weight. The final score is the weighted sum. Featured markets are
 *   pinned above everything else via a large additive constant.
 *
 * Signals (weights must sum to 1.0):
 *   1. Bet Velocity     (0.30) — bets per hour since creation
 *   2. Time Urgency     (0.25) — exponential boost as deadline approaches
 *   3. Momentum Shift   (0.20) — recent odds movement volatility
 *   4. Hot Score        (0.15) — cumulative engagement depth (log-scaled)
 *   5. Tension          (0.08) — proximity to 50/50 split
 *   6. Social           (0.02) — user's circle is involved
 *
 * Tuning:
 *   Change the WEIGHTS object or the TUNING constants below.
 *   Nothing else needs to change. All math is isolated per signal.
 */

// ── Market shape (subset of what the DB returns) ─────────────────────────────

export interface RankableMarket {
  id: string
  created_at: string
  end_time: string
  resolved: boolean
  is_featured: boolean | null
  yes_percent: number | null
  hot_score: number | null
  momentum_shift: number | null
  total_credits: number | null
  circle_id: string | null
}

// ── Weights — must sum to 1.0 ─────────────────────────────────────────────────

export const WEIGHTS = {
  velocity:  0.30,  // Bet velocity: bets-per-hour since creation
  urgency:   0.25,  // Time urgency: exponential ramp as deadline nears
  momentum:  0.20,  // Momentum shift: recent odds movement
  hot_score: 0.15,  // Hot score: cumulative engagement (log-scaled)
  tension:   0.08,  // Tension: how close to 50/50 the odds are
  social:    0.02,  // Social: user's circle is involved
} as const

// ── Tuning constants ──────────────────────────────────────────────────────────

/**
 * Velocity: bets/hour at which the signal saturates to ~0.63.
 * Lower → more sensitive to sparse activity. Higher → requires more activity.
 * Default: 2 bets/hour reaches 0.63, 6 bets/hour reaches 0.95.
 */
const VELOCITY_HALF_POINT = 2

/**
 * Hot score: cumulative bet count at which log signal saturates to ~0.63.
 * Default: 10 bets → 0.63, 30 bets → 0.95.
 */
const HOT_SCORE_HALF_POINT = 10

/**
 * Momentum: odds movement (pp) at which signal saturates to 1.0 (clamped).
 * Default: 15pp movement = full momentum score.
 */
const MAX_MOMENTUM_PP = 15

/**
 * Urgency breakpoints (hours until resolution → urgency score).
 * Piecewise linear between each pair of points.
 * Markets past their end_time but not yet resolved get urgency = 0.
 * Increase URGENCY_FINAL_BOOST to make final-hours markets more dominant.
 */
const URGENCY_CURVE: Array<{ hoursRemaining: number; score: number }> = [
  { hoursRemaining: 0,    score: 0.00 }, // expired / awaiting resolution
  { hoursRemaining: 1,    score: 1.00 }, // final hour: maximum tension
  { hoursRemaining: 3,    score: 0.95 }, // final 3 hours: near-max
  { hoursRemaining: 12,   score: 0.75 }, // today: high
  { hoursRemaining: 24,   score: 0.45 }, // tomorrow: medium
  { hoursRemaining: 48,   score: 0.20 }, // two days out: low
  { hoursRemaining: 168,  score: 0.05 }, // a week out: minimal
]

/**
 * Large additive constant for featured markets so they always sort first,
 * regardless of organic rank score.
 */
const FEATURED_PIN_BONUS = 1_000_000

// ── Signal calculators ────────────────────────────────────────────────────────

/**
 * Bet velocity: bets per hour since market creation.
 * Uses exponential saturation: score = 1 - e^(-velocity / halfPoint)
 */
function velocitySignal(market: RankableMarket, nowMs: number): number {
  const hotScore = market.hot_score ?? 0
  if (hotScore === 0) return 0

  const createdMs = new Date(market.created_at).getTime()
  const hoursAlive = Math.max((nowMs - createdMs) / 3_600_000, 0.5) // min 30 min
  const betsPerHour = hotScore / hoursAlive

  return 1 - Math.exp(-betsPerHour / VELOCITY_HALF_POINT)
}

/**
 * Time urgency: piecewise linear curve from URGENCY_CURVE.
 * Markets that have already expired (awaiting resolution) return 0 — they're
 * no longer bettable, so they shouldn't dominate the feed.
 */
function urgencySignal(market: RankableMarket, nowMs: number): number {
  const endMs = new Date(market.end_time).getTime()
  const hoursRemaining = (endMs - nowMs) / 3_600_000

  if (hoursRemaining <= 0) return URGENCY_CURVE[0].score

  // Walk curve pairs from closest-to-expiry outward
  for (let i = 0; i < URGENCY_CURVE.length - 1; i++) {
    const lo = URGENCY_CURVE[i]
    const hi = URGENCY_CURVE[i + 1]

    if (hoursRemaining >= lo.hoursRemaining && hoursRemaining < hi.hoursRemaining) {
      // Linear interpolation between breakpoints
      const t = (hoursRemaining - lo.hoursRemaining) / (hi.hoursRemaining - lo.hoursRemaining)
      return lo.score + t * (hi.score - lo.score)
    }
  }

  // Beyond the last breakpoint — return the lowest defined score
  return URGENCY_CURVE[URGENCY_CURVE.length - 1].score
}

/**
 * Momentum shift: normalized recent odds movement.
 * Clamped to [0, 1] using MAX_MOMENTUM_PP.
 */
function momentumSignal(market: RankableMarket): number {
  const shift = market.momentum_shift ?? 0
  return Math.min(shift / MAX_MOMENTUM_PP, 1)
}

/**
 * Hot score: log-scaled cumulative engagement depth.
 * Prevents markets with 1000 bets from completely crushing newer ones.
 */
function hotScoreSignal(market: RankableMarket): number {
  const score = market.hot_score ?? 0
  if (score === 0) return 0
  // log(1 + x) / log(1 + halfPoint * k) where k makes halfPoint → 0.63
  return 1 - Math.exp(-score / HOT_SCORE_HALF_POINT)
}

/**
 * Tension: distance from 50/50.
 * score = 1.0 at yes_percent = 50 (maximum disagreement)
 * score = 0.0 at yes_percent = 0 or 100 (no contest)
 */
function tensionSignal(market: RankableMarket): number {
  const yp = market.yes_percent ?? 50
  return 1 - Math.abs(yp - 50) / 50
}

/**
 * Social signal: is the user a member of this market's circle?
 * Returns 1.0 if circle match, 0.0 otherwise.
 * Simple binary — no partial social graph needed.
 */
function socialSignal(
  market: RankableMarket,
  userCircleIds: Set<string>
): number {
  if (!market.circle_id) return 0
  return userCircleIds.has(market.circle_id) ? 1 : 0
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RankBreakdown {
  velocity: number
  urgency: number
  momentum: number
  hot_score: number
  tension: number
  social: number
  total: number
  pinned: boolean
}

/**
 * Compute the composite rank score for a single market.
 *
 * @param market        - Market row from the database
 * @param userCircleIds - Set of circle IDs the current user belongs to
 * @param nowMs         - Current timestamp in milliseconds (pass Date.now() for consistency)
 * @returns             Composite score (higher = shown earlier in feed)
 */
export function computeRankScore(
  market: RankableMarket,
  userCircleIds: Set<string>,
  nowMs: number
): number {
  // Resolved markets sink below everything bettable
  if (market.resolved) return -1

  const signals = {
    velocity:  velocitySignal(market, nowMs),
    urgency:   urgencySignal(market, nowMs),
    momentum:  momentumSignal(market),
    hot_score: hotScoreSignal(market),
    tension:   tensionSignal(market),
    social:    socialSignal(market, userCircleIds),
  }

  const organic =
    signals.velocity  * WEIGHTS.velocity +
    signals.urgency   * WEIGHTS.urgency +
    signals.momentum  * WEIGHTS.momentum +
    signals.hot_score * WEIGHTS.hot_score +
    signals.tension   * WEIGHTS.tension +
    signals.social    * WEIGHTS.social

  // Featured markets always appear above organic results
  return (market.is_featured ? FEATURED_PIN_BONUS : 0) + organic
}

/**
 * Sort an array of markets by rank score in-place (descending).
 * Featured markets are always first. Resolved markets always last.
 *
 * @param markets       - Array of enriched market objects (must include RankableMarket fields)
 * @param userCircleIds - Set of circle IDs the current user belongs to
 * @returns             The same array, sorted
 */
export function rankFeed<T extends RankableMarket>(
  markets: T[],
  userCircleIds: Set<string>
): T[] {
  const nowMs = Date.now()

  // Compute scores once per market to avoid re-computing during sort comparisons
  const scored = markets.map((m) => ({
    market: m,
    score: computeRankScore(m, userCircleIds, nowMs),
  }))

  scored.sort((a, b) => b.score - a.score)

  return scored.map(({ market }) => market)
}

/**
 * Debugging helper — returns the full signal breakdown for a market.
 * Useful for logging or an admin inspect endpoint.
 */
export function debugRankScore(
  market: RankableMarket,
  userCircleIds: Set<string>,
  nowMs = Date.now()
): RankBreakdown {
  if (market.resolved) {
    return { velocity: 0, urgency: 0, momentum: 0, hot_score: 0, tension: 0, social: 0, total: -1, pinned: false }
  }

  const v = velocitySignal(market, nowMs)
  const u = urgencySignal(market, nowMs)
  const m = momentumSignal(market)
  const h = hotScoreSignal(market)
  const t = tensionSignal(market)
  const s = socialSignal(market, userCircleIds)

  const organic = v * WEIGHTS.velocity + u * WEIGHTS.urgency + m * WEIGHTS.momentum + h * WEIGHTS.hot_score + t * WEIGHTS.tension + s * WEIGHTS.social
  const pinned = market.is_featured === true

  return {
    velocity: +v.toFixed(3),
    urgency: +u.toFixed(3),
    momentum: +m.toFixed(3),
    hot_score: +h.toFixed(3),
    tension: +t.toFixed(3),
    social: +s.toFixed(3),
    total: +(organic + (pinned ? FEATURED_PIN_BONUS : 0)).toFixed(3),
    pinned,
  }
}
