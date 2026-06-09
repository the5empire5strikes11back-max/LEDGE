/**
 * User-Generated Market Quality Screening
 *
 * Pure deterministic checks — no AI calls, no external dependencies.
 * Called in the /api/markets POST handler before any DB write.
 *
 * Three-verdict pipeline:
 *   reject  → return 422, never inserted
 *   review  → inserted with status='review' (hidden from feed pending admin action)
 *   accept  → inserted with status='live'
 *
 * Design principles:
 *   - Fast and cheap: runs in <1ms, no network calls
 *   - Auditable: every decision has a named reason
 *   - Conservative on safety (false positive = review, not reject)
 *   - Liberal on creativity (only block clearly bad content)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type QualityVerdict = 'accept' | 'reject' | 'review'

export interface QualityResult {
  verdict: QualityVerdict
  /** Primary human-readable reason (shown to user on reject) */
  reason: string | null
  /** All flags raised (for logging) */
  flags: string[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const ALLOWED_CATEGORIES = ['Sports', 'Politics', 'Culture', 'Tech', 'Viral', 'Wild'] as const
export type AllowedCategory = typeof ALLOWED_CATEGORIES[number]

/** Min/max title length for user-created markets */
export const TITLE_MIN = 15
export const TITLE_MAX = 200

/** Allowed close windows (hours) */
export const ALLOWED_CLOSE_HOURS = [24, 72, 168, 720] as const

/** Jaccard similarity threshold for near-duplicate detection (0–1) */
const DUPLICATE_THRESHOLD = 0.55

// ── Safety patterns — instant REJECT ─────────────────────────────────────────
//
// These represent content that must never appear in the feed.
// Pattern rationale is documented inline.

const SAFETY_REJECT: Array<{ pattern: RegExp; label: string }> = [
  // Violence directed at people
  {
    pattern: /\b(kill|shoot|stab|bomb|attack|murder|rape|assault)\s+(yourself|himself|herself|themselves|someone|a person|the)\b/i,
    label: 'directed violence',
  },
  // Hate speech (common slurs — partial list, can be extended)
  {
    pattern: /\b(n[i1!]gg[ae3]r|f[a4@]gg[o0]t|ch[i1!]nk|sp[i1!]c|k[i1!]ke|tr[a4@]nn[y]|r[e3]t[a4@]rd)\b/i,
    label: 'hate speech / slur',
  },
  // Self-harm / suicide
  {
    pattern: /\b(suicide|self[- ]harm|kill (my|him|her|them)self|end (my|his|her|their) life|cut (my|him|her|them)self)\b/i,
    label: 'self-harm content',
  },
  // Sexual content
  {
    pattern: /\b(porn|nude|naked|sex tape|onlyfans|nsfw|masturbat|genitals?|penis|vagina|vulva|nipple|upskirt|voyeur)\b/i,
    label: 'sexual content',
  },
  // Doxxing / privacy invasion
  {
    pattern: /\b(home address|social security number|SSN|passport number|bank account|credit card number|dox|doxx)\b/i,
    label: 'doxxing / privacy',
  },
  // Illegal acquisition
  {
    pattern: /\b(buy|sell|purchase|obtain|acquire)\s+(illegal\s+)?(guns?|cocaine|heroin|fentanyl|meth(amphetamine)?|ketamine|MDMA)\b/i,
    label: 'illegal activity',
  },
]

// ── Quality patterns — send to REVIEW ────────────────────────────────────────
//
// These suggest the market is hard to resolve cleanly or is low quality,
// but aren't clearly harmful. A human can approve them if they're fine.

const QUALITY_REVIEW: Array<{ pattern: RegExp; label: string }> = [
  // Pure opinion / subjective ("Is X better than Y?")
  {
    pattern: /\b(is|was|are|were)\s+\w[\w\s]{0,30}\s+(better|worse|superior|inferior)\s+than\b/i,
    label: 'subjective comparison',
  },
  // Normative framing ("Should X do Y?")
  {
    pattern: /^will\s+.{0,40}\b(deserve|ought|should)\b/i,
    label: 'normative / opinion question',
  },
  // Vague unresolvable subjects
  {
    pattern: /^will\s+(he|she|they|it|someone|anyone|nobody|somebody|someone|no one)\b/i,
    label: 'vague pronoun — unresolvable subject',
  },
  // "Best/worst" superlatives — subjective
  {
    pattern: /\b(best|worst|greatest|most (popular|successful|famous|influential))\b/i,
    label: 'subjective superlative',
  },
  // Open-ended timeline
  {
    pattern: /\b(ever|someday|eventually|at some point|in the near future|soon enough)\b/i,
    label: 'vague / open-ended timeframe',
  },
  // Multiple sub-questions in one
  {
    pattern: /.+\?.+\?/,
    label: 'compound question (multiple ?)',
  },
]

// ── Structural checks — instant REJECT ───────────────────────────────────────

interface StructuralInput {
  title: string
  category: string
  endTimeIso: string
}

function checkStructure(input: StructuralInput): string | null {
  const { title, category, endTimeIso } = input
  const trimmed = title.trim()

  if (trimmed.length < TITLE_MIN) {
    return `Question is too short (min ${TITLE_MIN} characters)`
  }
  if (trimmed.length > TITLE_MAX) {
    return `Question is too long (max ${TITLE_MAX} characters)`
  }
  if (!trimmed.endsWith('?')) {
    return 'Question must end with a question mark'
  }
  if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
    return `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`
  }

  const endDate = new Date(endTimeIso)
  if (isNaN(endDate.getTime())) {
    return 'Invalid close time'
  }
  const hoursUntilClose = (endDate.getTime() - Date.now()) / 3_600_000
  if (hoursUntilClose < 1) {
    return 'Close time must be at least 1 hour in the future'
  }
  if (hoursUntilClose > 31 * 24) {
    return 'Close time must be within 31 days'
  }

  return null
}

// ── Resolution clarity checks — instant REJECT ───────────────────────────────

const CLARITY_REJECT: Array<{ pattern: RegExp; label: string }> = [
  // "Did X happen?" — past-tense, already resolved
  {
    pattern: /^(did |has |have |was |were |is it true that )/i,
    label: 'past-tense / already-resolved question',
  },
  // Impossible or unfalsifiable subjects
  {
    pattern: /\b(god|allah|jesus|divine|supernatural|afterlife|heaven|hell|ghost|alien|ufos?|bigfoot|unicorn)\b/i,
    label: 'unfalsifiable / supernatural subject',
  },
  // Rhetorical questions ("Will water ever be wet?")
  {
    pattern: /\b(always|never|impossible|certainly|obviously|definitely will|obviously going to)\b/i,
    label: 'rhetorical / near-certain outcome',
  },
]

// ── Spam / abuse patterns — instant REJECT ───────────────────────────────────

const SPAM_REJECT: Array<{ pattern: RegExp; label: string }> = [
  // Advertising / URLs
  {
    pattern: /https?:\/\/|www\.|\.com|\.net|\.org|click here|sign up|subscribe|follow me/i,
    label: 'advertising / URL',
  },
  // All-caps shouting (>50% uppercase letters in a 20+ char string)
  {
    pattern: /^[^a-z]*[A-Z]{15,}[^a-z]*$/,
    label: 'all-caps / shouting',
  },
  // Excessive repetition ("Will X X X X?")
  {
    pattern: /(\b\w+\b)(?:\s+\1){3,}/i,
    label: 'word repetition spam',
  },
  // Gibberish (>30% non-alphabetic, non-space characters)
  // Caught via token check below
]

// ── Duplicate / near-duplicate detection ─────────────────────────────────────

/**
 * Normalize a title for similarity comparison:
 * lowercase → strip punctuation → collapse whitespace → sort tokens
 */
function normalizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2) // strip stop words shorter than 3 chars
}

/**
 * Jaccard similarity between two token sets (0 = no overlap, 1 = identical).
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

/**
 * Return the duplicate title if a near-match is found, else null.
 */
export function findDuplicate(
  candidate: string,
  existingTitles: string[]
): string | null {
  const candidateTokens = normalizeTitle(candidate)
  if (candidateTokens.length === 0) return null

  for (const existing of existingTitles) {
    const existingTokens = normalizeTitle(existing)
    const sim = jaccardSimilarity(candidateTokens, existingTokens)
    if (sim >= DUPLICATE_THRESHOLD) {
      return existing
    }
  }
  return null
}

// ── Gibberish / low-signal check ─────────────────────────────────────────────

function hasMinimumSignal(title: string): boolean {
  const letters = (title.match(/[a-zA-Z]/g) ?? []).length
  const total = title.replace(/\s/g, '').length
  if (total === 0) return false
  // Require at least 60% of non-space characters to be alphabetic
  return letters / total >= 0.6
}

// ── Main entrypoint ───────────────────────────────────────────────────────────

export interface ScreenInput {
  title: string
  category: string
  endTimeIso: string
  /** Titles of currently live + queued markets (for duplicate detection) */
  existingTitles: string[]
  /**
   * Creator trust score [0.1, 0.95].
   * Defaults to 0.5 (neutral) when not provided.
   * Trusted creators (≥0.70) have review patterns fast-tracked to accept.
   * Restricted creators (<0.35) have review patterns escalated to reject.
   */
  creatorTrust?: number
}

/**
 * Screen a user-submitted market for quality, safety, and duplicates.
 *
 * Returns:
 *   accept  — insert as status='live'
 *   review  — insert as status='review' (hidden from feed, queued for moderation)
 *   reject  — do not insert, return 422 with reason
 */
export function screenMarket(input: ScreenInput): QualityResult {
  const { title, category, endTimeIso, existingTitles, creatorTrust = 0.5 } = input
  const trimmed = title.trim()
  const flags: string[] = []

  // ── 1. Structural validation (reject) ─────────────────────────────────────

  const structureError = checkStructure({ title: trimmed, category, endTimeIso })
  if (structureError) {
    return { verdict: 'reject', reason: structureError, flags: ['structural'] }
  }

  // ── 2. Gibberish / low-signal (reject) ────────────────────────────────────

  if (!hasMinimumSignal(trimmed)) {
    return { verdict: 'reject', reason: 'Question contains too many non-text characters', flags: ['gibberish'] }
  }

  // ── 3. Safety patterns (reject) ───────────────────────────────────────────

  for (const { pattern, label } of SAFETY_REJECT) {
    if (pattern.test(trimmed)) {
      flags.push(`safety:${label}`)
      return {
        verdict: 'reject',
        reason: 'This question contains content that isn\'t allowed on Ledge.',
        flags,
      }
    }
  }

  // ── 4. Spam patterns (reject) ─────────────────────────────────────────────

  for (const { pattern, label } of SPAM_REJECT) {
    if (pattern.test(trimmed)) {
      flags.push(`spam:${label}`)
      return {
        verdict: 'reject',
        reason: 'This question looks like spam. Keep it a clear yes/no prediction.',
        flags,
      }
    }
  }

  // ── 5. Resolution clarity (reject) ────────────────────────────────────────

  for (const { pattern, label } of CLARITY_REJECT) {
    if (pattern.test(trimmed)) {
      flags.push(`clarity:${label}`)
      return {
        verdict: 'reject',
        reason: 'This question can\'t be clearly resolved as yes or no. Try rephrasing as a future prediction.',
        flags,
      }
    }
  }

  // ── 6. Duplicate / near-duplicate detection (reject) ──────────────────────

  const duplicate = findDuplicate(trimmed, existingTitles)
  if (duplicate) {
    flags.push('duplicate')
    return {
      verdict: 'reject',
      reason: `A similar market already exists: "${duplicate.slice(0, 80)}${duplicate.length > 80 ? '…' : ''}"`,
      flags,
    }
  }

  // ── 7. Quality / resolution clarity (review) ──────────────────────────────

  for (const { pattern, label } of QUALITY_REVIEW) {
    if (pattern.test(trimmed)) {
      flags.push(`quality:${label}`)
    }
  }

  if (flags.length > 0) {
    // ── 8. Trust-based verdict adjustment ─────────────────────────────────────
    // Trusted creators (≥0.70): soft quality flags don't block — let it through.
    // Restricted creators (<0.35): soft quality flags escalate to a full reject.
    // In both cases the flag is recorded so the decision is auditable.
    if (creatorTrust >= 0.70) {
      flags.push('trust-override:review→accept')
      return {
        verdict: 'accept',
        reason: null,
        flags,
      }
    }
    if (creatorTrust < 0.35) {
      flags.push('trust-escalate:review→reject')
      return {
        verdict: 'reject',
        reason: 'Your question needs to be a clear, unambiguous yes/no prediction.',
        flags,
      }
    }
    return {
      verdict: 'review',
      reason: 'Your prediction needs a quick review before going live.',
      flags,
    }
  }

  // ── All checks passed ──────────────────────────────────────────────────────

  return { verdict: 'accept', reason: null, flags: [] }
}
