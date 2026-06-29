/**
 * Constant-Product Market Maker (CPMM) over shares.
 *
 * Ledge's market engine. Reserves `y` (YES shares) and `n` (NO shares) hold the
 * invariant k = y · n. A user spends credits to receive shares of one side; each
 * winning share pays exactly 1 credit at resolution. The number of shares is
 * locked at purchase (the "max payout"), while the *live value* of those shares —
 * shares × current price — floats as the market moves.
 *
 * One engine drives price, buying, selling/cash-out, and settlement, so the live
 * value shown to the user and the cash-out they receive are always identical.
 *
 * Pure module: no I/O, no side effects. Everything here is unit-testable.
 */

export type Side = 'yes' | 'no'

// House margin, baked into shares once at purchase. Applies to both the eventual
// win payout and any earlier cash-out (both derive from the share count), so the
// economics match the old fixed-odds engine and round-trips can't be arbitraged.
export const HOUSE_MARGIN = 0.05

export interface Reserves {
  y: number // YES shares in the pool
  n: number // NO shares in the pool
}

/** Probability of YES ∈ (0,1). Degenerate/empty pools resolve to 0.5. */
export function priceYes({ y, n }: Reserves): number {
  const total = y + n
  if (total <= 0) return 0.5
  return n / total
}

/** Price of a given side ∈ (0,1). */
export function priceOf(reserves: Reserves, side: Side): number {
  const pYes = priceYes(reserves)
  return side === 'yes' ? pYes : 1 - pYes
}

/** yes_percent for display (0–100, one decimal). */
export function yesPercent(reserves: Reserves): number {
  return Math.round(priceYes(reserves) * 1000) / 10
}

export interface BuyResult {
  shares: number // shares credited to the user (locked max payout), margin applied
  reserves: Reserves // pool after the trade
}

/**
 * Buy `amount` credits worth of `side` shares.
 *
 * CPMM mechanic: add `amount` to both reserves, then withdraw shares of the
 * bought side to restore the invariant. The 5% house margin is applied to the
 * shares received (floored), then the reserves are set so the *post-margin* share
 * count is exactly what the user holds — keeping price, value, and settlement
 * consistent.
 */
export function buyShares(reserves: Reserves, side: Side, amount: number): BuyResult {
  if (amount <= 0) return { shares: 0, reserves }
  const { y, n } = reserves
  const k = y * n

  if (side === 'yes') {
    const yAfterAdd = y + amount
    const nAfterAdd = n + amount
    const rawShares = yAfterAdd - k / nAfterAdd
    const shares = Math.floor(rawShares * (1 - HOUSE_MARGIN))
    return { shares, reserves: { y: yAfterAdd - shares, n: nAfterAdd } }
  } else {
    const yAfterAdd = y + amount
    const nAfterAdd = n + amount
    const rawShares = nAfterAdd - k / yAfterAdd
    const shares = Math.floor(rawShares * (1 - HOUSE_MARGIN))
    return { shares, reserves: { y: yAfterAdd, n: nAfterAdd - shares } }
  }
}

export interface SellResult {
  credits: number // credits returned to the user (floored)
  reserves: Reserves // pool after the trade
}

/**
 * Sell `shares` of `side` back into the pool (early cash-out).
 *
 * Inverse of a buy: returning `s` shares of the side, find credits `C` withdrawn
 * from both reserves that restores the invariant. For a YES sale:
 *   (y + s − C)(n − C) = k
 * Expand to the quadratic  C² − (y + n + s)·C + s·n = 0  and take the smaller
 * (economically valid) root. `C` is floored and clamped to [0, s] — you can never
 * cash out a share for more than its 1-credit settlement value.
 */
export function sellShares(reserves: Reserves, side: Side, shares: number): SellResult {
  if (shares <= 0) return { credits: 0, reserves }
  const { y, n } = reserves
  const k = y * n

  // For a YES sale the pool's NO reserve is `n`; for a NO sale it's `y`. The
  // quadratic is symmetric with the opposite-side reserve in the constant term.
  const opp = side === 'yes' ? n : y
  const b = y + n + shares
  const c = shares * opp
  const disc = b * b - 4 * c
  if (disc < 0) return { credits: 0, reserves } // no valid trade — return nothing
  const root = (b - Math.sqrt(disc)) / 2
  const credits = Math.max(0, Math.min(shares, Math.floor(root)))

  if (side === 'yes') {
    return { credits, reserves: { y: y + shares - credits, n: n - credits } }
  } else {
    return { credits, reserves: { y: y - credits, n: n + shares - credits } }
  }
}

/** Live value of a held position right now: shares × current side price. */
export function positionValue(reserves: Reserves, side: Side, shares: number): number {
  return Math.floor(shares * priceOf(reserves, side))
}

/**
 * Seed opening reserves from a target YES probability and a depth budget.
 * n = D·p, y = D·(1−p) so priceYes = n/(y+n) = p. Deeper D = steadier odds.
 */
export function seedReserves(probYes: number, depth: number): Reserves {
  const p = Math.max(0.01, Math.min(0.99, probYes))
  const d = Math.max(1, depth)
  return { y: Math.round(d * (1 - p)), n: Math.round(d * p) }
}

/**
 * Fraction of each bet reinvested as pool depth after the trade.
 * Implements the Othman et al. (2013) liquidity-sensitive AMM property:
 * as volume accumulates the pool deepens, so later bets move the odds
 * less than early ones — just like a real market.
 */
export const LIQUIDITY_REINVEST_RATE = 0.10

/**
 * Add `amount` credits of depth to the pool without moving the price.
 * Injects proportionally to the current reserve ratio so the YES/NO price
 * is unchanged — only the pool depth (and therefore price impact) increases.
 */
export function addLiquidity(reserves: Reserves, amount: number): Reserves {
  if (amount <= 0) return reserves
  const { y, n } = reserves
  const total = y + n
  if (total <= 0) return reserves
  return {
    y: y + (amount * y / total),
    n: n + (amount * n / total),
  }
}
