import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { SHOP_ITEMS, getItem, extendXpBoost } from '@/lib/shop'
import { FREEZE_CAP } from '@/lib/streak'
import { rateLimit, LIMITS } from '@/lib/rate-limit'
import { logError } from '@/lib/logger'

/** GET — the item catalog + the caller's credits and inventory. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: p } = await (supabase as any)
    .from('profiles')
    .select('credits, double_down_tokens, xp_boost_until, streak_freezes, safety_net_tokens, streak, pre_reset_streak')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    items: SHOP_ITEMS,
    credits: p?.credits ?? 0,
    inventory: {
      double_down_tokens: p?.double_down_tokens ?? 0,
      xp_boost_until: p?.xp_boost_until ?? null,
      streak_freezes: p?.streak_freezes ?? 0,
      safety_net_tokens: p?.safety_net_tokens ?? 0,
      streak: p?.streak ?? 0,
      pre_reset_streak: p?.pre_reset_streak ?? 0,
    },
  })
}

/** POST — buy an item with credits. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const item = getItem(typeof body?.item === 'string' ? body.item : '')
    if (!item) return NextResponse.json({ error: 'Unknown item' }, { status: 400 })

    const admin = createAdminClient()
    const rl = await rateLimit(admin, { key: `${user.id}:bets`, ...LIMITS.bets })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Slow down.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: p } = await (admin as any)
      .from('profiles')
      .select('credits, double_down_tokens, xp_boost_until, streak_freezes, safety_net_tokens, streak, pre_reset_streak')
      .eq('id', user.id)
      .single()
    if (!p) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    if ((p.credits ?? 0) < item.price) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
    }

    // Build the grant for this item.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { credits: p.credits - item.price }
    if (item.key === 'double_down') {
      update.double_down_tokens = (p.double_down_tokens ?? 0) + 1
    } else if (item.key === 'safety_net') {
      update.safety_net_tokens = (p.safety_net_tokens ?? 0) + 1
    } else if (item.key === 'xp_boost') {
      update.xp_boost_until = extendXpBoost(p.xp_boost_until)
    } else if (item.key === 'streak_freeze') {
      if ((p.streak_freezes ?? 0) >= FREEZE_CAP) {
        return NextResponse.json({ error: `You can hold at most ${FREEZE_CAP} freezes` }, { status: 400 })
      }
      update.streak_freezes = (p.streak_freezes ?? 0) + 1
    } else if (item.key === 'streak_repair') {
      const preReset = p.pre_reset_streak ?? 0
      if (preReset <= 1 || (p.streak ?? 0) !== 1) {
        return NextResponse.json({ error: 'No lost streak to repair' }, { status: 400 })
      }
      const today = new Date().toISOString().slice(0, 10)
      update.streak = preReset
      update.last_streak_date = today
      update.pre_reset_streak = 0
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('profiles').update(update).eq('id', user.id)

    return NextResponse.json({
      ok: true,
      item: item.key,
      credits: update.credits,
      inventory: {
        double_down_tokens: update.double_down_tokens ?? p.double_down_tokens ?? 0,
        xp_boost_until: update.xp_boost_until ?? p.xp_boost_until ?? null,
        streak_freezes: update.streak_freezes ?? p.streak_freezes ?? 0,
        safety_net_tokens: update.safety_net_tokens ?? p.safety_net_tokens ?? 0,
        streak: update.streak ?? p.streak ?? 0,
      },
    }, { status: 201 })
  } catch (err) {
    logError(err, { context: 'shop:POST' })
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
