/**
 * Market Liquidity System
 *
 * Virtual liquidity provides market depth without fake users or fake trades.
 * It seeds every market with invisible backstop pools that dampen early
 * volatility and give odds realistic stability from the first bet.
 *
 * Key properties:
 *   - Virtual pools are NEVER paid out to users on resolution
 *   - Virtual depth DECAYS as real trading volume grows (price discovery)
 *   - All visible odds reflect effective (real + virtual) pools
 *   - total_credits tracks REAL user volume only
 *
 * Formula:
 *   effective_yes = yes_pool + virtual_yes_pool × decay_factor(hot_score)
 *   effective_no  = no_pool  + virtual_no_pool  × decay_factor(hot_score)
 *   yes_percent   = effective_yes / (effective_yes + effective_no) × 100
 */

export type MarketCategory = 'Sports' | 'Politics' | 'Culture' | 'Circle'

// ── Base virtual liquidity by category ───────────────────────────────────────
// These are the YES and NO seed amounts added to every new market.
// Higher depth = slower, more stable odds movement.

export const BASE_LIQUIDITY: Record<MarketCategory, number> = {
  Sports:   18_000,  // High depth — sports outcomes are well-researched
  Culture:  12_000,  // Medium — pop culture is debatable
  Politics:  8_000,  // Lower — political markets should be sensitive
  Circle:    4_000,  // Minimum — personal circles, very reactive
}

// Extra virtual liquidity added on top for featured markets
export const FEATURED_LIQUIDITY_BONUS = 6_000

// ── Dynamic decay ─────────────────────────────────────────────────────────────
// Virtual depth decays as real trading volume grows, allowing real price
// discovery to take over once a market has meaningful participation.
//
// At 0 trades:  full virtual depth (market stabilized)
// At HALF_LIFE trades: 50% virtual depth
// At FULL_DECAY trades: ~5% virtual depth (effectively negligible)
//
// Formula: decay = exp(−hot_score × ln(2) / HALF_LIFE)

const DECAY_HALF_LIFE = 20   // 20 real trades → 50% virtual depth remaining
const DECAY_FLOOR    = 0.05  // never fully remove — keeps some stability always

export function virtualDecayFactor(hotScore: number): number {
  if (hotScore <= 0) return 1.0
  const decay = Math.exp(-(hotScore * Math.LN2) / DECAY_HALF_LIFE)
  return Math.max(DECAY_FLOOR, decay)
}

// ── Effective pool computation ────────────────────────────────────────────────

export interface PoolState {
  yes_pool: number
  no_pool: number
  virtual_yes_pool: number
  virtual_no_pool: number
  hot_score: number
}

export function effectivePools(state: PoolState): {
  effectiveYes: number
  effectiveNo: number
  effectiveTotal: number
} {
  const decay = virtualDecayFactor(state.hot_score)
  const effectiveYes = state.yes_pool + Math.round(state.virtual_yes_pool * decay)
  const effectiveNo  = state.no_pool  + Math.round(state.virtual_no_pool  * decay)
  return {
    effectiveYes,
    effectiveNo,
    effectiveTotal: effectiveYes + effectiveNo,
  }
}

export function computeYesPercent(state: PoolState): number {
  const { effectiveYes, effectiveTotal } = effectivePools(state)
  if (effectiveTotal === 0) return 50
  return Math.round((effectiveYes / effectiveTotal) * 100 * 10) / 10
}

// ── Seeded pools for new market insertion ────────────────────────────────────

export interface LiquiditySeed {
  virtual_yes_pool: number
  virtual_no_pool: number
  yes_percent: number
}

export function seedLiquidity(
  category: MarketCategory,
  isFeatured = false,
  /**
   * System-estimated YES probability (30–70). Provided by the AI at generation time
   * based on headline context and base rates. Shown as "System estimate" on the card
   * until real bets arrive (totalCredits > 0) and the market has user-driven odds.
   *
   * Clamped to 30–70 here as a hard guard — markets must always stay debatable.
   * Defaults to 50 (perfectly neutral) for user-created markets or when not provided.
   */
  starterProbability = 50
): LiquiditySeed {
  const base = BASE_LIQUIDITY[category]
  const bonus = isFeatured ? FEATURED_LIQUIDITY_BONUS : 0
  const pool = base + bonus

  // Clamp to 30–70 regardless of caller — markets must stay debatable
  const prob = Math.max(30, Math.min(70, starterProbability)) / 100

  return {
    virtual_yes_pool: Math.round(pool * prob),
    virtual_no_pool:  Math.round(pool * (1 - prob)),
    yes_percent:      Math.round(prob * 100),
  }
}

// ── Market depth description (for internal logging/debug) ────────────────────

export function liquidityLabel(
  totalVirtual: number,
  hotScore: number
): string {
  const decay = virtualDecayFactor(hotScore)
  const active = Math.round(totalVirtual * decay)
  if (active >= 30_000) return 'deep'
  if (active >= 15_000) return 'liquid'
  if (active >= 6_000)  return 'moderate'
  return 'thin'
}

// ── Impact estimation (useful for UI tooltips if needed) ─────────────────────
// Computes how much a given bet amount moves the odds

export function estimateOddsImpact(
  state: PoolState,
  betSide: 'yes' | 'no',
  betAmount: number
): { before: number; after: number; deltaPp: number } {
  const before = computeYesPercent(state)

  const nextState: PoolState = {
    ...state,
    yes_pool: state.yes_pool + (betSide === 'yes' ? betAmount : 0),
    no_pool:  state.no_pool  + (betSide === 'no'  ? betAmount : 0),
    hot_score: state.hot_score + 1,
  }

  const after = computeYesPercent(nextState)
  return {
    before,
    after,
    deltaPp: Math.abs(after - before),
  }
}
