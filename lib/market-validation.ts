/**
 * Market temporal validation — the strict, date-aware gate that prevents
 * stale, impossible, or badly-timed markets from ever being created.
 *
 * Pure & deterministic (no AI, no network), so it runs on every path:
 *   - AI generation  (lib/market-generator.ts)
 *   - user creation  (app/api/markets POST)
 *   - cron release   (app/api/cron/refresh-markets, release-markets)
 *
 * It is intentionally NARROW: it owns the *temporal & resolvability* contract
 * (freshness, time anchor, duration sanity, resolution path, already-happened
 * phrasing). Content/safety/clarity screening lives in market-quality.ts and
 * the AI scorer — this does not duplicate them.
 */

// ── Single source of truth for market duration bounds ─────────────────────────
// Every path clamps to these. Prevents the "89 days left" class of bug where
// different creation paths used different ceilings (generator 7d, user 1yr).
export const MARKET_DURATION = {
  /** A market must have at least this much life left to be worth creating. */
  MIN_HOURS: 2,
  /** Hard system ceiling. Nothing may close further out than this (30 days). */
  MAX_HOURS: 720,
  /** AI generator's preferred ceiling — markets stay fresh and high-tension. */
  AI_PREFERRED_MAX_HOURS: 168, // 7 days
} as const

export type MarketRejectCode =
  | 'end_time_missing'
  | 'end_time_invalid'
  | 'event_already_happened'
  | 'duration_too_short'
  | 'duration_too_long'
  | 'event_date_invalid'
  | 'duration_inconsistent'
  | 'no_time_anchor'
  | 'already_resolved_phrasing'
  | 'stale_topic'
  | 'compound_question'
  | 'resolution_unclear'

export interface MarketValidationInput {
  title: string
  /** ISO timestamp at which the market closes / resolves. Required. */
  endTimeIso: string
  /**
   * ISO timestamp of the underlying real-world event (when the generator knows
   * it). When present, we cross-check that the event is in the future and that
   * the market closes near it — not weeks before or after.
   */
  eventDateIso?: string | null
  resolutionCriteria?: string | null
  resolutionSourceUrl?: string | null
  targetDataKey?: string | null
  /**
   * Require a concrete resolution path (criteria + a source/data key).
   * On for AI-generated markets; off for user markets (the app supplies
   * resolution downstream).
   */
  requireResolution?: boolean
  /** Injectable clock for deterministic tests. Defaults to Date.now(). */
  nowMs?: number
}

export interface MarketValidation {
  valid: boolean
  status: 'valid' | 'rejected'
  code?: MarketRejectCode
  /** Specific, human-readable reason when rejected. */
  reason?: string
  /** Hours from now until close — a sane countdown value for valid markets. */
  countdownHours?: number
}

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/** Hours after a dated event before its outcome is reliably knowable. */
const RESOLVE_BUFFER_HOURS = 3

/**
 * Compute a market's close timestamp (ms).
 *
 * `hoursUntilClose` is the model's relative close offset; `eventDateIso` is the
 * absolute moment the outcome becomes known. The two frequently disagree — an LLM
 * can't keep a relative offset consistent with an absolute date, especially for
 * "within N days" / "this week" window questions where it picks a small offset but
 * a later deadline. So when a valid *future* event date is present we ANCHOR the
 * close to it (event + buffer) instead of letting a smaller offset land before the
 * event. That stray case used to be the #1 cause of generated markets being
 * dropped as `duration_inconsistent`. Mirrors the ESPN re-anchoring already used
 * for verified games. Always clamped to the system bounds [MIN_HOURS, MAX_HOURS].
 */
export function resolveCloseTimeMs(opts: {
  nowMs: number
  hoursUntilClose?: number | null
  eventDateIso?: string | null
}): number {
  const { nowMs } = opts
  // Baseline from the relative offset, clamped to the AI-preferred window.
  const hours = Math.max(4, Math.min(MARKET_DURATION.AI_PREFERRED_MAX_HOURS, opts.hoursUntilClose ?? 24))
  let closeMs = nowMs + hours * HOUR_MS

  // Anchor to a concrete *future* event date so the market never closes before
  // the outcome can resolve. Past/invalid dates are ignored here and caught by
  // validateMarket's event-already-happened check.
  if (opts.eventDateIso) {
    const evMs = new Date(opts.eventDateIso).getTime()
    if (!Number.isNaN(evMs) && evMs > nowMs) {
      closeMs = Math.max(closeMs, evMs + RESOLVE_BUFFER_HOURS * HOUR_MS)
    }
  }

  // Clamp to hard system bounds.
  const minMs = nowMs + MARKET_DURATION.MIN_HOURS * HOUR_MS
  const maxMs = nowMs + MARKET_DURATION.MAX_HOURS * HOUR_MS
  return Math.min(maxMs, Math.max(minMs, closeMs))
}

// ── Language patterns (already-happened / vague / compound) ───────────────────

/** Vague, unanchored timeframes — "no time anchor" rule. */
const VAGUE_TIMEFRAME =
  /\b(some\s?day|eventually|in the future|at some point|sooner or later|one day|soon enough|in the coming (weeks|months|years)|in the near future)\b/i

/** Question phrased about something that already resolved. */
const ALREADY_RESOLVED =
  /^\s*(did|has|have|had|was|were|who won|who is the (new|current)|when did|what happened)\b/i

/** Month name → 0-indexed month, for parsing explicit "June 11" style dates. */
const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * Detect an explicit calendar date ("June 9", "Jun 9th") in the title that has
 * already passed this year. Catches the common failure where the LLM sets a
 * future end_time but the event date named in the title is yesterday.
 * Returns the matched "Month DD" string when stale, else null.
 *
 * Guards against year-wrap: a "January" reference seen in December resolves to
 * next year, so a date computed >300 days in the past is treated as a future
 * wrap, not a stale reference.
 */
function pastCalendarDate(title: string, now: number): string | null {
  const m = title.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  )
  if (!m) return null
  const month = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()]
  const day = Number(m[2])
  if (month === undefined || day < 1 || day > 31) return null
  const year = new Date(now).getUTCFullYear()
  // End of the named day in UTC — gives the event until day's end before stale.
  const candidate = Date.UTC(year, month, day, 23, 59, 59)
  const daysPast = (now - candidate) / DAY_MS
  // Past this year, but not so far back that it's actually a next-year wrap.
  return daysPast > 0 && daysPast < 300 ? `${m[1]} ${day}` : null
}

function reject(code: MarketRejectCode, reason: string): MarketValidation {
  return { valid: false, status: 'rejected', code, reason }
}

/**
 * Validate a market's timing, anchoring, and resolvability.
 * Returns { valid:true, countdownHours } or a specific rejection.
 */
export function validateMarket(input: MarketValidationInput): MarketValidation {
  const now = input.nowMs ?? Date.now()
  const title = (input.title ?? '').trim()

  // ── Step 2 — Date check: end_time exists, parses, and is in the future ──────
  if (!input.endTimeIso || typeof input.endTimeIso !== 'string') {
    return reject('end_time_missing', 'Market has no close time')
  }
  const endMs = new Date(input.endTimeIso).getTime()
  if (Number.isNaN(endMs)) {
    return reject('end_time_invalid', `Unparseable close time: "${input.endTimeIso}"`)
  }
  const hoursToClose = (endMs - now) / HOUR_MS
  if (hoursToClose <= 0) {
    return reject('event_already_happened', `Close time is in the past (${hoursToClose.toFixed(1)}h)`)
  }

  // ── Step 4 — Duration sanity: never too short, never absurdly far out ───────
  if (hoursToClose < MARKET_DURATION.MIN_HOURS) {
    return reject('duration_too_short', `Only ${hoursToClose.toFixed(1)}h left (min ${MARKET_DURATION.MIN_HOURS}h)`)
  }
  if (hoursToClose > MARKET_DURATION.MAX_HOURS) {
    return reject(
      'duration_too_long',
      `Closes ${(hoursToClose / 24).toFixed(0)} days out (max ${MARKET_DURATION.MAX_HOURS / 24} days)`,
    )
  }

  // ── Event-date cross-check (when the generator anchored to a real event) ────
  if (input.eventDateIso != null && input.eventDateIso !== '') {
    const evMs = new Date(input.eventDateIso).getTime()
    if (Number.isNaN(evMs)) {
      return reject('event_date_invalid', `Unparseable event date: "${input.eventDateIso}"`)
    }
    // Event already happened (1h grace for in-progress live events).
    if (evMs < now - HOUR_MS) {
      return reject('event_already_happened', 'Underlying event is in the past')
    }
    // Market must not close before the event can resolve…
    if (endMs < evMs - HOUR_MS) {
      return reject('duration_inconsistent', 'Market closes before the event happens')
    }
    // …nor linger for weeks after a dated event (keeps the feed fresh).
    if (endMs > evMs + 7 * DAY_MS) {
      return reject('duration_inconsistent', 'Market closes too long after the event resolves')
    }
  }

  // ── Step 2b — Time anchor: reject vague, unanchored timeframes ──────────────
  if (VAGUE_TIMEFRAME.test(title)) {
    return reject('no_time_anchor', 'No concrete time anchor — vague timeframe')
  }

  // ── Step 6 — Staleness: already-resolved phrasing or a past-year reference ──
  if (ALREADY_RESOLVED.test(title)) {
    return reject('already_resolved_phrasing', 'Phrased about a past or already-decided outcome')
  }
  const yearMatch = title.match(/\b(20\d{2})\b/)
  if (yearMatch) {
    const referencedYear = Number(yearMatch[1])
    const currentYear = new Date(now).getUTCFullYear()
    if (referencedYear < currentYear) {
      return reject('stale_topic', `References a past year (${referencedYear})`)
    }
  }
  const staleDate = pastCalendarDate(title, now)
  if (staleDate) {
    return reject('stale_topic', `References a date that has passed (${staleDate})`)
  }

  // ── Step 5 — Specificity: one question per market (no compound questions) ───
  const questionMarks = (title.match(/\?/g) ?? []).length
  if (questionMarks >= 2) {
    return reject('compound_question', 'Multiple questions in one market — ask a single yes/no question')
  }
  if (/\b(and|or)\s+will\b/i.test(title)) {
    return reject('compound_question', 'Compound question — split into one prediction per market')
  }

  // ── Step 3 — Resolution path (AI-generated markets) ─────────────────────────
  if (input.requireResolution) {
    const hasCriteria = !!input.resolutionCriteria && input.resolutionCriteria.trim().length >= 10
    const hasSource =
      (!!input.resolutionSourceUrl && input.resolutionSourceUrl.trim() !== '') ||
      (!!input.targetDataKey && input.targetDataKey.trim() !== '')
    if (!hasCriteria || !hasSource) {
      return reject('resolution_unclear', 'No clear resolution criteria or source')
    }
  }

  return {
    valid: true,
    status: 'valid',
    countdownHours: Math.round(hoursToClose * 10) / 10,
  }
}

/** One-line summary for cron / debug logs. */
export function describeValidation(title: string, v: MarketValidation): string {
  return v.valid
    ? `✅ valid (${v.countdownHours}h) "${title}"`
    : `❌ ${v.code}: ${v.reason} — "${title}"`
}
