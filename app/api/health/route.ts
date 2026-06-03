/**
 * GET /api/health
 *
 * System health check. Returns 200 when healthy, 503 when degraded.
 * Safe to call unauthenticated — contains no sensitive data.
 *
 * Used by:
 *   - Vercel status monitoring
 *   - Manual pre-launch verification
 *   - Launch-week ops checks
 *
 * Example healthy response:
 *   { healthy: true, checks: { database: true, anthropic_key: true, ... } }
 */

import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const checks: Record<string, boolean> = {
    anthropic_key:       !!process.env.ANTHROPIC_API_KEY,
    cron_secret:         !!process.env.CRON_SECRET,
    supabase_url:        !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_anon_key:   !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabase_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    vapid_keys:          !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
    sentry:              !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    kill_switch_generation: process.env.DISABLE_MARKET_GENERATION !== 'true',
    kill_switch_resolution: process.env.DISABLE_RESOLUTION !== 'true',
    database:            false,
  }

  // Live DB connectivity check — lightweight single-row read
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('profiles').select('id').limit(1)
    checks.database = !error
  } catch {
    checks.database = false
  }

  const healthy = checks.database &&
    checks.anthropic_key &&
    checks.supabase_url &&
    checks.supabase_anon_key &&
    checks.supabase_service_key

  return NextResponse.json(
    {
      healthy,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 }
  )
}
