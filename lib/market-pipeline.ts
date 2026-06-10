/**
 * Market editorial pipeline — the single gate every candidate market passes
 * through before it can be published. Runs the existing specialized checks in a
 * fixed order and collapses them into ONE explicit status, so callers (the AI
 * generation cron, debug tooling) get a uniform verdict instead of stitching
 * together validateMarket + screenMarket + dedup + category capacity by hand.
 *
 * Order (fail-fast, cheapest/most-decisive first):
 *   1. Temporal & resolvability  (validateMarket)        — fresh, dated, resolvable
 *   2. Content quality & safety  (screenMarket)          — clear, safe, lexically unique
 *   3. Semantic de-duplication   (market-dedup)          — no synonym clones
 *   4. Category capacity         (category-balance)      — respect the hard ceiling
 *
 * The pipeline is pure: it never writes. Callers accumulate accepted titles and
 * signatures and feed them back in so each candidate is screened against the
 * batch-so-far, not just the database.
 */

import { validateMarket, type MarketRejectCode } from '@/lib/market-validation'
import { screenMarket } from '@/lib/market-quality'
import {
  marketSignature,
  isSemanticDuplicate,
  type MarketSignature,
} from '@/lib/market-dedup'
import { isCategoryFull } from '@/lib/category-balance'

/** The explicit, user-facing outcome statuses required by the spec. */
export type PipelineStatus =
  | 'valid'
  | 'past_event'
  | 'stale'
  | 'missing_date'
  | 'countdown_mismatch'
  | 'ambiguous'
  | 'duplicate'
  | 'unsafe'
  | 'low_quality'
  | 'category_overflow'

export interface MarketCandidate {
  title: string
  category: string
  endTimeIso: string
  eventDateIso?: string | null
  resolutionCriteria?: string | null
  resolutionSourceUrl?: string | null
  targetDataKey?: string | null
}

export interface PipelineContext {
  /** Titles already live/queued + accepted earlier this batch (lexical dedup). */
  existingTitles: string[]
  /** Signatures of accepted markets — for semantic (synonym) de-duplication. */
  acceptedSignatures: MarketSignature[]
  /** Live, non-resolved market count per category — for the ceiling check. */
  liveCounts: Map<string, number>
  /** Injectable clock for deterministic tests. Defaults to Date.now(). */
  nowMs?: number
}

export interface PipelineResult {
  status: PipelineStatus
  ok: boolean
  /** Specific, human-readable reason when rejected; null when valid. */
  reason: string | null
  /** Hours until close for a valid market — the exact, verified countdown. */
  countdownHours?: number
  /** Computed signature (when derivable) so callers can accumulate without recompute. */
  signature?: MarketSignature | null
}

/** Map a temporal-validation reject code to a pipeline status. */
function statusForRejectCode(code: MarketRejectCode | undefined): PipelineStatus {
  switch (code) {
    case 'end_time_missing':
    case 'end_time_invalid':
    case 'event_date_invalid':
      return 'missing_date'
    case 'event_already_happened':
    case 'already_resolved_phrasing':
      return 'past_event'
    case 'duration_too_short':
    case 'duration_too_long':
    case 'duration_inconsistent':
      return 'countdown_mismatch'
    case 'stale_topic':
      return 'stale'
    case 'no_time_anchor':
    case 'compound_question':
    case 'resolution_unclear':
      return 'ambiguous'
    default:
      return 'ambiguous'
  }
}

/** Map a quality-screen rejection (by its flags) to a pipeline status. */
function statusForScreenFlags(flags: string[]): PipelineStatus {
  if (flags.some((f) => f.startsWith('safety:') || f.startsWith('spam:'))) return 'unsafe'
  if (flags.includes('duplicate')) return 'duplicate'
  if (flags.includes('structural') || flags.includes('gibberish') || flags.some((f) => f.startsWith('clarity:'))) {
    return 'ambiguous'
  }
  return 'low_quality'
}

/**
 * Screen one candidate through the full editorial pipeline.
 * On 'valid', the caller should append the title to existingTitles and the
 * returned signature (if non-null) to acceptedSignatures before screening the
 * next candidate, so intra-batch dedup works.
 */
export function screenCandidate(
  candidate: MarketCandidate,
  ctx: PipelineContext
): PipelineResult {
  const nowMs = ctx.nowMs ?? Date.now()

  // ── 1. Temporal & resolvability ────────────────────────────────────────────
  const temporal = validateMarket({
    title: candidate.title,
    endTimeIso: candidate.endTimeIso,
    eventDateIso: candidate.eventDateIso,
    resolutionCriteria: candidate.resolutionCriteria,
    resolutionSourceUrl: candidate.resolutionSourceUrl,
    targetDataKey: candidate.targetDataKey,
    requireResolution: true,
    nowMs,
  })
  if (!temporal.valid) {
    return {
      status: statusForRejectCode(temporal.code),
      ok: false,
      reason: temporal.reason ?? 'Failed temporal validation',
    }
  }

  // ── 2. Content quality & safety (also runs lexical Jaccard dedup) ───────────
  const quality = screenMarket({
    title: candidate.title,
    category: candidate.category,
    endTimeIso: candidate.endTimeIso,
    existingTitles: ctx.existingTitles,
  })
  if (quality.verdict !== 'accept') {
    return {
      status: statusForScreenFlags(quality.flags),
      ok: false,
      reason: quality.reason ?? `Quality screen: ${quality.verdict}`,
    }
  }

  // ── 3. Semantic de-duplication (synonym clones Jaccard misses) ──────────────
  const signature = marketSignature(candidate.title)
  if (signature && isSemanticDuplicate(signature, ctx.acceptedSignatures)) {
    return {
      status: 'duplicate',
      ok: false,
      reason: 'Semantic duplicate of an existing market (same event, different words)',
      signature,
    }
  }

  // ── 4. Category capacity (hard ceiling) ─────────────────────────────────────
  if (isCategoryFull(candidate.category, ctx.liveCounts)) {
    return {
      status: 'category_overflow',
      ok: false,
      reason: `Category "${candidate.category}" is at its live-market ceiling`,
      signature,
    }
  }

  // ── Valid ───────────────────────────────────────────────────────────────────
  return {
    status: 'valid',
    ok: true,
    reason: null,
    countdownHours: temporal.countdownHours,
    signature,
  }
}
