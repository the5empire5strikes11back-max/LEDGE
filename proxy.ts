import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import type { Database } from '@/types/database'

// ── Per-IP rate limiting (abuse/DoS backstop in front of per-user route limits) ──
//
// Auth endpoints get a strict 5-attempts / 15-min bucket; every other /api route
// gets a generous per-IP ceiling. Backed by the Supabase `rate_limits` table.
//
// Exempt: Stripe webhooks (many Stripe IPs, verified by signature) and cron jobs
// (invoked by Vercel, authenticated by CRON_SECRET) — IP-limiting would break them.
const RL_EXEMPT_PREFIXES = ['/api/stripe/webhook', '/api/cron/']
const RL_AUTH = { limit: 5, windowMs: 15 * 60_000 }
const RL_GENERAL = { limit: 240, windowMs: 60_000 }

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

async function checkRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/api/')) return null
  if (RL_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Fail open if service config is missing rather than break every API call.
  if (!url || !serviceKey) return null

  const admin = createAdminSupabase<Database>(url, serviceKey, { auth: { persistSession: false } })
  const ip = getClientIp(request)
  const isAuth = pathname.startsWith('/api/auth/')
  const cfg = isAuth ? RL_AUTH : RL_GENERAL

  const { allowed, retryAfter } = await rateLimit(admin, {
    key: isAuth ? `auth:${ip}` : `ip:${ip}`,
    ...cfg,
    waitForWrite: true, // edge runtime — persist the count before responding
  })

  if (allowed) return null

  return NextResponse.json(
    {
      error: isAuth
        ? 'Too many attempts. Please wait a few minutes and try again.'
        : 'Too many requests. Please slow down.',
      retryAfter,
    },
    { status: 429, headers: { 'Retry-After': String(retryAfter ?? 60) } }
  )
}

export async function proxy(request: NextRequest) {
  // Rate-limit /api/* before doing any session work.
  const limited = await checkRateLimit(request)
  if (limited) return limited

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login (except auth routes)
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')
  const isPublicRoute =
    request.nextUrl.pathname === '/landing' ||
    request.nextUrl.pathname === '/privacy' ||
    request.nextUrl.pathname === '/terms' ||
    request.nextUrl.pathname === '/onboarding'

  if (!user && !isAuthRoute && !isApiRoute && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/landing'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthRoute && !request.nextUrl.pathname.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
