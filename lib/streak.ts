/**
 * Streak engine — Duolingo-style daily streaks with freezes.
 *
 * Single source of truth for streak advancement. A "streak day" is one calendar
 * day (in the user's local timezone — the client sends its local date) on which
 * the user completed the daily goal (claiming the daily drop). Miss a day and a
 * Streak Freeze is auto-consumed to save the streak; out of freezes → reset.
 *
 * Pure module: dates are plain 'YYYY-MM-DD' strings; no I/O, fully testable.
 */

/** Max freezes a player can hold at once. */
export const FREEZE_CAP = 3
/** Credit cost to buy one freeze. */
export const FREEZE_PRICE = 1000
/** Grant a freeze each time the streak hits a multiple of this many days. */
export const FREEZE_MILESTONE = 7

export interface StreakState {
  streak: number
  /** Last calendar day the streak advanced, 'YYYY-MM-DD', or null if never. */
  lastStreakDate: string | null
  freezes: number
}

export type StreakOutcome =
  | 'already'   // already counted today — no change
  | 'started'   // first ever streak day
  | 'extended'  // consecutive day → +1
  | 'frozen'    // missed day(s) covered by freezes → preserved
  | 'reset'     // missed day(s), no freezes → back to 1

export interface StreakResult extends StreakState {
  outcome: StreakOutcome
  freezesConsumed: number
  freezeGranted: boolean   // a milestone awarded a freeze this advance
  hitMilestone: boolean    // streak landed on a FREEZE_MILESTONE multiple
  /** Streak value before a reset; 0 when no reset occurred. Used by Streak Repair. */
  preResetStreak: number
}

/** Parse 'YYYY-MM-DD' to a UTC-midnight epoch (calendar-date math, tz-free). */
function dayEpoch(d: string): number {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

/** Whole calendar days from `a` to `b` (b - a). Negative if b is before a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayEpoch(b) - dayEpoch(a)) / 86_400_000)
}

/**
 * Advance a streak for completing today's goal.
 * `today` is the user's local calendar date ('YYYY-MM-DD').
 */
export function advanceStreak(state: StreakState, today: string): StreakResult {
  const freezes = Math.max(0, state.freezes ?? 0)
  const prev = state.lastStreakDate

  // First ever, or no prior date.
  if (!prev) {
    return finalize({ streak: 1, lastStreakDate: today, freezes }, 'started', 0, state.streak)
  }

  const gap = daysBetween(prev, today)

  if (gap <= 0) {
    // Already counted today (gap 0), or a stale/duplicate request (negative).
    return { ...state, freezes, outcome: 'already', freezesConsumed: 0, freezeGranted: false, hitMilestone: false }
  }

  if (gap === 1) {
    return finalize({ streak: (state.streak ?? 0) + 1, lastStreakDate: today, freezes }, 'extended', 0, state.streak)
  }

  // gap >= 2 → one or more missed days. Each missed day needs one freeze.
  const missed = gap - 1
  if (freezes >= missed) {
    return finalize(
      { streak: (state.streak ?? 0) + 1, lastStreakDate: today, freezes: freezes - missed },
      'frozen', missed, state.streak,
    )
  }
  // Not enough freezes — the streak broke. Start fresh at 1.
  return finalize({ streak: 1, lastStreakDate: today, freezes }, 'reset', 0, state.streak, state.streak)
}

/** Apply the milestone freeze grant + flags to a computed new state. */
function finalize(next: StreakState, outcome: StreakOutcome, freezesConsumed: number, prevStreak: number, preResetStreak = 0): StreakResult {
  const hitMilestone =
    next.streak > 0 &&
    next.streak % FREEZE_MILESTONE === 0 &&
    next.streak !== prevStreak // only on the day you cross it
  let freezes = next.freezes
  let freezeGranted = false
  if (hitMilestone && freezes < FREEZE_CAP) {
    freezes += 1
    freezeGranted = true
  }
  return { ...next, freezes, outcome, freezesConsumed, freezeGranted, hitMilestone, preResetStreak }
}
