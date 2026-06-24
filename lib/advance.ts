/**
 * Daily Advance — Manifold-style loans, reframed.
 *
 * A player pulls a slice of the value locked in their open positions back out,
 * once a day. To stop it minting credits, an advance is a *loan*: tracked as
 * `outstanding_advance` debt and skimmed off the top of every winning payout and
 * cash-out until repaid. Outstanding debt reduces future borrowing capacity, so
 * the same locked value can't be borrowed against indefinitely.
 *
 * Pure module: no I/O, fully unit-testable.
 */

// Fraction of open-position value a player may have advanced at once.
export const ADVANCE_RATE = 0.15
// Most that can be claimed in a single day.
export const DAILY_MAX = 2000
// Below this, there's nothing worth claiming.
export const MIN_CLAIM = 100

/** How much more a player can borrow right now, given their locked value + debt. */
export function borrowingCapacity(liveValue: number, outstanding: number): number {
  const cap = Math.floor(ADVANCE_RATE * Math.max(0, liveValue)) - Math.max(0, outstanding)
  return Math.max(0, cap)
}

/** Today's claimable advance: capacity capped at the daily max, 0 if below MIN_CLAIM. */
export function claimableAdvance(liveValue: number, outstanding: number): number {
  const claim = Math.min(borrowingCapacity(liveValue, outstanding), DAILY_MAX)
  return claim >= MIN_CLAIM ? claim : 0
}

export interface RepayResult {
  net: number       // credits actually paid out to the user after skim
  repaid: number    // amount applied to the debt
  remaining: number // outstanding debt after this repayment
}

/**
 * Skim a debt repayment off proceeds (a winning payout or cash-out value).
 * Never repays more than is owed or more than the proceeds; never goes negative.
 */
export function repayAdvance(outstanding: number, proceeds: number): RepayResult {
  const debt = Math.max(0, outstanding)
  const gross = Math.max(0, proceeds)
  const repaid = Math.min(debt, gross)
  return { net: gross - repaid, repaid, remaining: debt - repaid }
}

/** True when two instants fall on the same UTC calendar day. */
export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}
