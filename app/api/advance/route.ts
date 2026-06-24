import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sellShares, seedReserves, type Reserves, type Side } from '@/lib/amm'
import { claimableAdvance, isSameUtcDay } from '@/lib/advance'
import { rateLimit, LIMITS } from '@/lib/rate-limit'
import { logError } from '@/lib/logger'

/**
 * Sum the live cash-out value of a user's open positions, valued through the same
 * CPMM sellShares the cash-out uses. Only live (unresolved, open) markets count.
 */
async function openPositionsValue(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bets } = await (admin as any)
    .from('bets')
    .select('side, payout, shares, markets(yes_shares, no_shares, yes_percent, virtual_yes_pool, virtual_no_pool, total_credits, resolved, end_time)')
    .eq('user_id', userId)
    .is('won', null)

  const now = Date.now()
  let total = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bets ?? []) as Array<{ side: Side; payout: number | null; shares: number | null; markets: any }>) {
    const m = b.markets
    if (!m || m.resolved || new Date(m.end_time as string).getTime() <= now) continue
    const held = b.shares ?? b.payout
    if (held == null) continue
    const reserves: Reserves =
      m.yes_shares != null && m.no_shares != null
        ? { y: m.yes_shares as number, n: m.no_shares as number }
        : seedReserves(((m.yes_percent as number) ?? 50) / 100,
            Math.max(6000, ((m.virtual_yes_pool as number) ?? 0) + ((m.virtual_no_pool as number) ?? 0) + ((m.total_credits as number) ?? 0)))
    total += sellShares(reserves, b.side, held as number).credits
  }
  return total
}

/** GET — what the caller could claim today, plus their outstanding debt. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles').select('outstanding_advance, last_advance_at').eq('id', user.id).single()
  const outstanding = (profile?.outstanding_advance as number) ?? 0
  const lastAt = profile?.last_advance_at ? new Date(profile.last_advance_at as string) : null
  const alreadyClaimedToday = lastAt ? isSameUtcDay(lastAt, new Date()) : false

  const liveValue = await openPositionsValue(admin, user.id)
  const claimable = alreadyClaimedToday ? 0 : claimableAdvance(liveValue, outstanding)

  return NextResponse.json({ claimable, outstanding, liveValue, alreadyClaimedToday })
}

/** POST — claim today's advance. Credits it now and records the loan as debt. */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const rl = await rateLimit(admin, { key: `${user.id}:bets`, ...LIMITS.bets })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Slow down.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (admin as any)
      .from('profiles').select('credits, outstanding_advance, last_advance_at').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const lastAt = profile.last_advance_at ? new Date(profile.last_advance_at as string) : null
    if (lastAt && isSameUtcDay(lastAt, new Date())) {
      return NextResponse.json({ error: 'Already claimed today', alreadyClaimedToday: true }, { status: 409 })
    }

    const outstanding = (profile.outstanding_advance as number) ?? 0
    const liveValue = await openPositionsValue(admin, user.id)
    const claim = claimableAdvance(liveValue, outstanding)
    if (claim < 1) return NextResponse.json({ error: 'Nothing available to advance yet' }, { status: 400 })

    const newCredits = (profile.credits ?? 0) + claim
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('profiles').update({
      credits: newCredits,
      outstanding_advance: outstanding + claim,
      last_advance_at: new Date().toISOString(),
    }).eq('id', user.id)

    return NextResponse.json({ claimed: claim, credits: newCredits, outstanding: outstanding + claim }, { status: 201 })
  } catch (err) {
    logError(err, { context: 'advance:POST' })
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
