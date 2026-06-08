/**
 * Server-side input validation helpers.
 *
 * Every field that users can write gets validated here before it
 * touches the database.  Centralising rules means a single place
 * to tighten them — and makes the "how could someone break this?"
 * question easy to answer.
 */

// ── Field length limits ───────────────────────────────────────────────────────
export const LIMITS = {
  marketTitle:   { min: 10, max: 200 },
  circleName:    { min: 2,  max: 50  },
  username:      { min: 2,  max: 30  },
  betAmount:     { min: 1,  max: 100_000 },
  avatarBytes:   5 * 1024 * 1024,   // 5 MB
} as const

// ── Characters that should never appear in free-text user input ───────────────
// Blocks SQL injection attempts and basic script injection probes.
// Supabase uses parameterised queries so this is defence-in-depth.
const DANGEROUS_PATTERN = /<script|javascript:|on\w+\s*=|--\s|;\s*drop\s|union\s+select/i

export interface ValidationResult {
  ok:    boolean
  error?: string
}

// ── Individual field validators ───────────────────────────────────────────────

export function validateMarketTitle(raw: unknown): ValidationResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Title must be a string' }
  const v = raw.trim()
  if (v.length < LIMITS.marketTitle.min) return { ok: false, error: `Title too short (min ${LIMITS.marketTitle.min} chars)` }
  if (v.length > LIMITS.marketTitle.max) return { ok: false, error: `Title too long (max ${LIMITS.marketTitle.max} chars)` }
  if (DANGEROUS_PATTERN.test(v))         return { ok: false, error: 'Title contains disallowed content' }
  return { ok: true }
}

export function validateCircleName(raw: unknown): ValidationResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Name must be a string' }
  const v = raw.trim()
  if (v.length < LIMITS.circleName.min) return { ok: false, error: `Name too short (min ${LIMITS.circleName.min} chars)` }
  if (v.length > LIMITS.circleName.max) return { ok: false, error: `Name too long (max ${LIMITS.circleName.max} chars)` }
  if (DANGEROUS_PATTERN.test(v))        return { ok: false, error: 'Name contains disallowed content' }
  return { ok: true }
}

export function validateUsername(raw: unknown): ValidationResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Username must be a string' }
  const v = raw.trim()
  if (v.length < LIMITS.username.min) return { ok: false, error: `Username too short (min ${LIMITS.username.min} chars)` }
  if (v.length > LIMITS.username.max) return { ok: false, error: `Username too long (max ${LIMITS.username.max} chars)` }
  // Only letters, numbers, underscores, hyphens
  if (!/^[a-zA-Z0-9_-]+$/.test(v))   return { ok: false, error: 'Username may only contain letters, numbers, _ and -' }
  return { ok: true }
}

export function validateBetAmount(raw: unknown): ValidationResult {
  const n = Number(raw)
  if (!Number.isFinite(n) || n !== Math.floor(n)) return { ok: false, error: 'Amount must be a whole number' }
  if (n < LIMITS.betAmount.min) return { ok: false, error: `Minimum bet is ${LIMITS.betAmount.min} CR` }
  if (n > LIMITS.betAmount.max) return { ok: false, error: `Maximum single bet is ${LIMITS.betAmount.max.toLocaleString()} CR` }
  return { ok: true }
}

export function validateEndTime(raw: unknown): ValidationResult {
  if (typeof raw !== 'string') return { ok: false, error: 'end_time must be a string' }
  const d = new Date(raw)
  if (isNaN(d.getTime()))      return { ok: false, error: 'Invalid end_time' }
  if (d <= new Date())         return { ok: false, error: 'end_time must be in the future' }
  // Cap at 1 year from now
  const oneYear = new Date()
  oneYear.setFullYear(oneYear.getFullYear() + 1)
  if (d > oneYear)             return { ok: false, error: 'end_time cannot be more than 1 year away' }
  return { ok: true }
}

// ── Admin guard ───────────────────────────────────────────────────────────────
/**
 * Returns true if the request carries the admin secret header.
 * Used to protect debug / seed / cron routes.
 */
export function isAdminRequest(request: Request): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) return false
  return request.headers.get('x-admin-secret') === secret
}
