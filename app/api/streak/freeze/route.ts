import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { FREEZE_CAP, FREEZE_PRICE } from '@/lib/streak'
import { rateLimit, LIMITS } from '@/lib/rate-limit'
import { logError } from '@/lib/logger'

/** GET — the caller's freeze inventory + price. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles').select('streak, streak_freezes').eq('id', user.id).single()
  return NextResponse.json({
    streak: profile?.streak ?? 0,
    freezes: profile?.streak_freezes ?? 0,
    cap: FREEZE_CAP,
    price: FREEZE_PRICE,
  })
}

/** POST — buy one streak freeze with credits (capped at FREEZE_CAP). */
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
      .from('profiles').select('credits, streak_freezes').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const freezes = profile.streak_freezes ?? 0
    if (freezes >= FREEZE_CAP) {
      return NextResponse.json({ error: `You can hold at most ${FREEZE_CAP} freezes` }, { status: 400 })
    }
    if ((profile.credits ?? 0) < FREEZE_PRICE) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
    }

    const newCredits = profile.credits - FREEZE_PRICE
    const newFreezes = freezes + 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('profiles')
      .update({ credits: newCredits, streak_freezes: newFreezes }).eq('id', user.id)

    return NextResponse.json({ freezes: newFreezes, credits: newCredits, cap: FREEZE_CAP }, { status: 201 })
  } catch (err) {
    logError(err, { context: 'streak:freeze:POST' })
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
