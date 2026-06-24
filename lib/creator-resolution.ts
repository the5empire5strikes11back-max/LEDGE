/**
 * Creator resolution — trust-balanced settlement for subjective markets.
 *
 * Objective markets resolve automatically (source → AI → void). Subjective ones
 * (resolution_mode='creator') let the creator propose the outcome at close, held
 * through a dispute window. If bettors dispute past a threshold the market voids
 * + refunds instead — so the worst case is always a refund, never a theft.
 *
 * Pure module: the threshold/timing logic, unit-testable in isolation.
 */

export const CREATOR_DISPUTE_HOURS = 24
export const CREATOR_RESOLVE_DEADLINE_HOURS = 48
export const MIN_DISPUTES = 2
export const DISPUTE_FRACTION = 0.3

/**
 * How many disputes void a creator-resolved market.
 * - Normal: max(MIN_DISPUTES, ceil(30% × unique bettors)).
 * - If the creator bet on their own market (conflict of interest): any 1 dispute.
 */
export function disputeThreshold(uniqueBettors: number, creatorHasBet: boolean): number {
  if (creatorHasBet) return 1
  return Math.max(MIN_DISPUTES, Math.ceil(DISPUTE_FRACTION * Math.max(0, uniqueBettors)))
}

/** Would this many disputes void the market? */
export function shouldVoid(disputes: number, uniqueBettors: number, creatorHasBet: boolean): boolean {
  return disputes >= disputeThreshold(uniqueBettors, creatorHasBet)
}

const HOUR_MS = 3_600_000

/** Hours elapsed since an ISO timestamp. */
export function hoursSince(iso: string, nowMs: number = Date.now()): number {
  return (nowMs - new Date(iso).getTime()) / HOUR_MS
}

export type CreatorStage =
  | { stage: 'await_proposal' }                 // closed, creator hasn't proposed, within deadline
  | { stage: 'abandoned' }                       // closed, no proposal, past deadline → void
  | { stage: 'in_dispute_window' }               // proposed, window still open → hold
  | { stage: 'ready_to_settle' }                 // proposed, window elapsed → evaluate disputes

/**
 * Decide what to do with a closed creator-mode market.
 * `endTimeIso` = market close; `proposedAtIso` = when the creator proposed (or null).
 */
export function creatorStage(
  endTimeIso: string,
  proposedAtIso: string | null,
  nowMs: number = Date.now()
): CreatorStage {
  if (!proposedAtIso) {
    return hoursSince(endTimeIso, nowMs) >= CREATOR_RESOLVE_DEADLINE_HOURS
      ? { stage: 'abandoned' }
      : { stage: 'await_proposal' }
  }
  return hoursSince(proposedAtIso, nowMs) >= CREATOR_DISPUTE_HOURS
    ? { stage: 'ready_to_settle' }
    : { stage: 'in_dispute_window' }
}
