/**
 * Server-side rate limiter backed by Supabase.
 *
 * Works across all serverless instances — no Redis required.
 * Uses a `rate_limits` table with a (key, created_at) schema.
 *
 * Usage:
 *   const { allowed, retryAfter } = await rateLimit(adminClient, {
 *     key: `${userId}:bets`,
 *     limit: 5,
 *     windowMs: 30_000,
 *   })
 *   if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 */

import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

interface RateLimitOptions {
  /** Unique key for this bucket — typically "{userId}:{endpoint}" */
  key: string
  /** Maximum requests allowed within the window */
  limit: number
  /** Window size in milliseconds */
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  /** Remaining requests in this window */
  remaining: number
  /** Seconds until the window resets (only set when blocked) */
  retryAfter?: number
}

export async function rateLimit(
  supabase: AdminClient,
  { key, limit, windowMs }: RateLimitOptions
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMs).toISOString()

  // Count requests in the current window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error: countError } = await (supabase as any)
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', windowStart)

  if (countError) {
    // On DB error, fail open — don't block legitimate users
    console.error('[rate-limit] count error:', countError.message)
    return { allowed: true, remaining: limit }
  }

  const current = count ?? 0

  if (current >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(windowMs / 1000),
    }
  }

  // Record this request (fire-and-forget — don't block the response)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(supabase as any)
    .from('rate_limits')
    .insert({ key })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.error('[rate-limit] insert error:', error.message)
    })

  return { allowed: true, remaining: limit - current - 1 }
}

/** Pre-configured limiters for common endpoints */
export const LIMITS = {
  /** Max 8 bets per 30 seconds — prevents credit drain spam */
  bets: { limit: 8, windowMs: 30_000 },
  /** Max 3 user-created markets per hour — quality control for UGC */
  marketsCreate: { limit: 3, windowMs: 60 * 60_000 },
  /** Max 3 circles per hour */
  circlesCreate: { limit: 3, windowMs: 60 * 60_000 },
  /** Max 20 general API calls per 10 seconds */
  general: { limit: 20, windowMs: 10_000 },
} as const
