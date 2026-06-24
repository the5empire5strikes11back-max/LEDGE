import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit, LIMITS } from '@/lib/rate-limit'
import { validateBetAmount } from '@/lib/validate'
import { logError } from '@/lib/logger'

/** GET — the caller's pending auto-bets, with market title + current odds. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('auto_bets')
    .select('id, market_id, side, target_percent, amount, status, created_at, markets(title, yes_percent)')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/**
 * POST — arm an auto-bet. Escrows the credits up front (deducts from the profile)
 * so it can always execute and can't be double-spent. Refunded on cancel/expiry.
 */
export async function POST(request: Request) {
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

    const body = await request.json()
    const { market_id, side, target_percent, amount } = body as {
      market_id?: string; side?: 'yes' | 'no'; target_percent?: number; amount?: number
    }

    if (!market_id || typeof market_id !== 'string' || !side || !['yes', 'no'].includes(side)) {
      return NextResponse.json({ error: 'Invalid auto-bet data' }, { status: 400 })
    }
    if (typeof target_percent !== 'number' || !Number.isInteger(target_percent) || target_percent < 1 || target_percent > 99) {
      return NextResponse.json({ error: 'Target must be between 1% and 99%' }, { status: 400 })
    }
    const amountValidation = validateBetAmount(amount)
    if (!amountValidation.ok) return NextResponse.json({ error: amountValidation.error }, { status: 400 })
    const safeAmount = amount as number

    // Market must be live and bettable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: market } = await (admin as any)
      .from('markets')
      .select('id, resolved, end_time, group_type, circle_id')
      .eq('id', market_id)
      .maybeSingle()
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    if (market.group_type === 'poll') return NextResponse.json({ error: 'Polls are voted on, not bet on' }, { status: 400 })
    if (market.resolved || new Date(market.end_time) <= new Date()) {
      return NextResponse.json({ error: 'Market is closed' }, { status: 400 })
    }

    // Circle markets: members only (mirrors the bet route's guard).
    if (market.circle_id) {
      const { data: membership } = await admin
        .from('circle_members').select('circle_id')
        .eq('circle_id', market.circle_id).eq('user_id', user.id).maybeSingle()
      if (!membership) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Can't auto-bet a market you already hold a position on (one bet per market).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingBet } = await (admin as any)
      .from('bets').select('id').eq('user_id', user.id).eq('market_id', market_id).is('won', null).maybeSingle()
    if (existingBet) return NextResponse.json({ error: 'You already have a position on this market' }, { status: 409 })

    // Funds check, then escrow.
    const { data: profile } = await admin.from('profiles').select('credits').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    if ((profile.credits ?? 0) < safeAmount) return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })

    // Insert first (the partial unique index rejects a second pending trigger),
    // then escrow only if the insert succeeded — avoids deducting on a duplicate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: autoBet, error: insErr } = await (admin as any)
      .from('auto_bets')
      .insert({ user_id: user.id, market_id, side, target_percent, amount: safeAmount, status: 'pending' })
      .select('id, side, target_percent, amount')
      .single()
    if (insErr) {
      if (insErr.code === '23505') return NextResponse.json({ error: 'You already have an auto-bet on this market' }, { status: 409 })
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    const newCredits = (profile.credits ?? 0) - safeAmount
    await admin.from('profiles').update({ credits: newCredits }).eq('id', user.id)

    return NextResponse.json({ autoBet, escrowed: safeAmount, credits: newCredits }, { status: 201 })
  } catch (err) {
    logError(err, { context: 'auto-bets:POST' })
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
