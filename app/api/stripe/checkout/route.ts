import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getStripe, PLUS_PRICE_ID, getCreditPack, type CreditPackId } from '@/lib/stripe'
import { rateLimit } from '@/lib/rate-limit'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledge-prediction.vercel.app'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Admin client (needed for rate limit + profile writes) ─────────────────
  const admin = createAdminClient()

  // Rate limit: max 10 checkout sessions per 10 minutes per user
  const rl = await rateLimit(admin, { key: `${user.id}:stripe-checkout`, limit: 10, windowMs: 10 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 })
  }

  const body = await request.json() as { type: 'plus' | 'credits'; packId?: CreditPackId }
  const { type, packId } = body

  // ── Resolve or create Stripe customer ────────────────────────────────────
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id, username')
    .eq('id', user.id)
    .single()

  let customerId: string | undefined = profile?.stripe_customer_id ?? undefined

  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email,
      metadata: { userId: user.id, username: profile?.username ?? '' },
    })
    customerId = customer.id
    await admin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  // ── Build checkout session ────────────────────────────────────────────────
  if (type === 'plus') {
    if (!PLUS_PRICE_ID) {
      return NextResponse.json({ error: 'Plus price not configured' }, { status: 500 })
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: PLUS_PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}/?payment=success&type=plus`,
      cancel_url:  `${APP_URL}/?payment=cancelled`,
      metadata: { userId: user.id, type: 'plus' },
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  }

  if (type === 'credits') {
    const pack = packId ? getCreditPack(packId) : null
    if (!pack) return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })
    if (!pack.priceId) {
      return NextResponse.json({ error: 'Credit pack price not configured' }, { status: 500 })
    }

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: pack.priceId, quantity: 1 }],
      success_url: `${APP_URL}/?payment=success&type=credits&amount=${pack.credits}`,
      cancel_url:  `${APP_URL}/?payment=cancelled`,
      metadata: { userId: user.id, type: 'credits', credits: String(pack.credits) },
    })

    return NextResponse.json({ url: session.url })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
