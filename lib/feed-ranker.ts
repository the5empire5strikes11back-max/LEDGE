import { scoreInterestMatch } from '@/lib/interest-tags'

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
  title?: string
  created_at: string
  end_time: string
  resolved: boolean
  is_featured: boolean | null
  yes_percent: number | null
  hot_score: number | null
  momentum_shift: number | null
  total_credits: number | null
  circle_id: string | null
  category?: string
  /** Set when the market goes from queued → live. Used for freshness boost. */
  published_at?: string | null
  /**
   * Creator trust score [0.1, 0.95]. Omitted for AI-generated markets.
   * Used as a subtle additive adjustment to the rank score (±0.04 max).
   */
  creator_trust?: number | null
}

// ── Category affinity — maps category name → [0, 1] preference score ─────────
// Built from the user's bet history. Markets in the user's preferred category
// get a moderate boost so the feed feels personally relevant.

export type CategoryAffinityMap = Map<string, number>

/**
 * Build a category affinity map from bet history.
 * Each category gets a score proportional to its share of the user's bets,
 * normalized so the highest-bet category = 1.0.
 */
export function buildAffinityMap(
  betHistory: Array<{ category: string }>
): CategoryAffinityMap {
  const counts = new Map<string, number>()
  for (const b of betHistory) {
    counts.set(b.category, (counts.get(b.category) ?? 0) + 1)
  }
  const max = Math.max(...counts.values(), 1)
  const result = new Map<string, number>()
  for (const [cat, count] of counts) {
    result.set(cat, count / max)
  }
  return result
}

// ── Weights — must sum to 1.0 ─────────────────────────────────────────────────

export const WEIGHTS = {
  velocity:  0.26,  // Bet velocity: bets-per-hour since creation
  urgency:   0.22,  // Time urgency: exponential ramp as deadline nears
  momentum:  0.18,  // Momentum shift: recent odds movement
  hot_score: 0.13,  // Hot score: cumulative engagement (log-scaled)
  tension:   0.07,  // Tension: how close to 50/50 the odds are
  affinity:  0.06,  // User affinity: category preference from bet history
  interest:  0.06,  // Interest match: subcategory preference from quiz/bet history
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

/**
 * Freshness bonus: newly published markets get a temporary additive boost
 * that decays linearly to zero over FRESHNESS_DECAY_HOURS.
 * Max bonus is additive (not weighted) so it can't overpower a truly hot market.
 *
 * e.g. at t=0 of publish → +0.20; at t=1h → +0.10; at t=2h → 0
 */
const FRESHNESS_MAX_BONUS = 0.20
const FRESHNESS_DECAY_HOURS = 2

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

/**
 * Category affinity: how much does the user prefer this market's category?
 * Returns [0, 1] from the precomputed affinity map.
 * Falls back to 0.3 (neutral interest) for categories with no history.
 */
function affinitySignal(
  market: RankableMarket,
  affinityMap: CategoryAffinityMap
): number {
  if (!market.category) return 0.3
  return affinityMap.get(market.category) ?? 0.3
}

/**
 * Interest match: subcategory-level preference from quiz and/or bet history.
 * Returns scoreInterestMatch result: 1.0 match, 0.15 non-match, 0.5 neutral, 0.4 untagged.
 */
function interestSignal(
  market: RankableMarket,
  userInterests: string[]
): number {
  if (!market.title) return 0.5
  return scoreInterestMatch(market.title, userInterests)
}

/**
 * Creator trust adjustment: gentle additive signal derived from the creator's
 * track record (approval ratio + engagement).
 *
 * Maps [0.1, 0.95] → [-0.04, +0.04] so it's meaningful but never dominant.
 * AI-generated markets (no creator_trust) get 0 adjustment.
 * Neutral creators (trust=0.5) also get 0 adjustment — no noise for new accounts.
 */
function creatorTrustAdjustment(market: RankableMarket): number {
  const trust = market.creator_trust
  if (trust == null) return 0            // AI-generated or unknown → no adjustment
  if (Math.abs(trust - 0.5) < 0.05) return 0  // Near-neutral → no noise
  // Linear map: trust 0.1→-0.04, 0.5→0, 0.95→+0.04
  return (trust - 0.5) * (0.04 / 0.45)
}

/**
 * Freshness bonus: temporary additive boost for recently published markets.
 * Decays linearly from FRESHNESS_MAX_BONUS → 0 over FRESHNESS_DECAY_HOURS.
 * Returns 0 if market has no published_at (pre-queue-system markets).
 *
 * This is ADDITIVE, not weighted — avoids a brand-new low-activity market
 * outranking a genuinely hot one, while still giving new markets initial air.
 */
function freshnessBonus(market: RankableMarket, nowMs: number): number {
  if (!market.published_at) return 0
  const ageHours = (nowMs - new Date(market.published_at).getTime()) / 3_600_000
  if (ageHours >= FRESHNESS_DECAY_HOURS) return 0
  return FRESHNESS_MAX_BONUS * (1 - ageHours / FRESHNESS_DECAY_HOURS)
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RankBreakdown {
  velocity: number
  urgency: number
  momentum: number
  hot_score: number
  tension: number
  affinity: number
  interest: number
  social: number
  freshness: number
  creator_trust_adj: number
  total: number
  pinned: boolean
}

/**
 * Compute the composite rank score for a single market.
 *
 * @param market        - Market row from the database
 * @param userCircleIds - Set of circle IDs the current user belongs to
 * @param nowMs         - Current timestamp in milliseconds (pass Date.now() for consistency)
 * @param affinityMap   - Optional category affinity map from user's bet history
 * @param userInterests - Optional subcategory interest tags from quiz / bet history
 * @returns             Composite score (higher = shown earlier in feed)
 */
export function computeRankScore(
  market: RankableMarket,
  userCircleIds: Set<string>,
  nowMs: number,
  affinityMap: CategoryAffinityMap = new Map(),
  userInterests: string[] = []
): number {
  // Resolved markets sink below everything bettable
  if (market.resolved) return -1

  const signals = {
    velocity:  velocitySignal(market, nowMs),
    urgency:   urgencySignal(market, nowMs),
    momentum:  momentumSignal(market),
    hot_score: hotScoreSignal(market),
    tension:   tensionSignal(market),
    affinity:  affinitySignal(market, affinityMap),
    interest:  interestSignal(market, userInterests),
    social:    socialSignal(market, userCircleIds),
  }

  const organic =
    signals.velocity  * WEIGHTS.velocity +
    signals.urgency   * WEIGHTS.urgency +
    signals.momentum  * WEIGHTS.momentum +
    signals.hot_score * WEIGHTS.hot_score +
    signals.tension   * WEIGHTS.tension +
    signals.affinity  * WEIGHTS.affinity +
    signals.interest  * WEIGHTS.interest +
    signals.social    * WEIGHTS.social

  // Freshness boost fades over 2 hours after publish — gives new markets initial air
  const freshness = freshnessBonus(market, nowMs)

  // Creator trust: subtle ±0.04 additive based on creator track record
  const trustAdj = creatorTrustAdjustment(market)

  // Featured markets always appear above organic results
  return (market.is_featured ? FEATURED_PIN_BONUS : 0) + organic + freshness + trustAdj
}

// ── First-session weights ─────────────────────────────────────────────────────
// New users need markets that feel: contested (close odds), alive (activity),
// and fast (resolve soon). We suppress slow/niche markets entirely.

const FIRST_SESSION_WEIGHTS = {
  tension:   0.35,  // Close to 50/50 = high drama and accessibility
  hot_score: 0.30,  // Real people betting = the world feels alive
  urgency:   0.25,  // Resolves soon = immediate anticipation
  velocity:  0.10,  // Recent momentum signal
} as const

/**
 * First-session feed ranking.
 *
 * Surfaces markets that feel: contested, active, and fast-resolving.
 * Applies a speed multiplier that penalises multi-day markets so new users
 * see something they can check back on within hours, not days.
 *
 * Circle markets are excluded (they feel confusing to a new user).
 */
export function rankFeedFirstSession<T extends RankableMarket>(markets: T[]): T[] {
  const nowMs = Date.now()
  const candidates = markets.filter((m) => !m.resolved && !m.circle_id)

  const scored = candidates.map((m) => {
    const t = tensionSignal(m)
    const h = hotScoreSignal(m)
    const u = urgencySignal(m, nowMs)
    const v = velocitySignal(m, nowMs)

    const hoursLeft = (new Date(m.end_time).getTime() - nowMs) / 3_600_000
    // Boost same-day markets; penalise anything > 2 days out
    const speedMultiplier = hoursLeft < 12 ? 1.4 : hoursLeft < 24 ? 1.15 : hoursLeft < 48 ? 0.9 : 0.55

    const score = (
      t * FIRST_SESSION_WEIGHTS.tension +
      h * FIRST_SESSION_WEIGHTS.hot_score +
      u * FIRST_SESSION_WEIGHTS.urgency +
      v * FIRST_SESSION_WEIGHTS.velocity
    ) * speedMultiplier + (m.is_featured ? 0.4 : 0)

    return { market: m, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.map(({ market }) => market)
}

/**
 * Sort an array of markets by rank score in-place (descending).
 * Featured markets are always first. Resolved markets always last.
 *
 * @param markets       - Array of enriched market objects (must include RankableMarket fields)
 * @param userCircleIds - Set of circle IDs the current user belongs to
 * @param affinityMap   - Optional category affinity map from user's bet history
 * @param userInterests - Optional subcategory interest tags from quiz / bet history
 * @returns             The same array, sorted
 */
export function rankFeed<T extends RankableMarket>(
  markets: T[],
  userCircleIds: Set<string>,
  affinityMap: CategoryAffinityMap = new Map(),
  userInterests: string[] = []
): T[] {
  const nowMs = Date.now()

  // Compute scores once per market to avoid re-computing during sort comparisons
  const scored = markets.map((m) => ({
    market: m,
    score: computeRankScore(m, userCircleIds, nowMs, affinityMap, userInterests),
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
    return { velocity: 0, urgency: 0, momentum: 0, hot_score: 0, tension: 0, affinity: 0, interest: 0, social: 0, freshness: 0, creator_trust_adj: 0, total: -1, pinned: false }
  }

  const v = velocitySignal(market, nowMs)
  const u = urgencySignal(market, nowMs)
  const m = momentumSignal(market)
  const h = hotScoreSignal(market)
  const t = tensionSignal(market)
  const s = socialSignal(market, userCircleIds)
  const trustAdj = creatorTrustAdjustment(market)

  const organic = v * WEIGHTS.velocity + u * WEIGHTS.urgency + m * WEIGHTS.momentum + h * WEIGHTS.hot_score + t * WEIGHTS.tension + s * WEIGHTS.social
  const pinned = market.is_featured === true
  const fresh = freshnessBonus(market, nowMs)

  return {
    velocity: +v.toFixed(3),
    urgency: +u.toFixed(3),
    momentum: +m.toFixed(3),
    hot_score: +h.toFixed(3),
    tension: +t.toFixed(3),
    affinity: 0,
    interest: 0,
    social: +s.toFixed(3),
    freshness: +fresh.toFixed(3),
    creator_trust_adj: +trustAdj.toFixed(3),
    total: +(organic + fresh + trustAdj + (pinned ? FEATURED_PIN_BONUS : 0)).toFixed(3),
    pinned,
  }
}
