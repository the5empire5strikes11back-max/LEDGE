import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const PROMO_CODES: Record<string, { creditsAwarded: number; description: string }> = {
  PH10OFF: { creditsAwarded: 45_000, description: '3 months of daily drops' },
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to redeem a promo code.' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) return NextResponse.json({ error: 'Enter a promo code.' }, { status: 400 })

  const promo = PROMO_CODES[code]
  if (!promo) return NextResponse.json({ error: 'Invalid promo code.' }, { status: 400 })

  const admin = createAdminClient()

  // Check if already redeemed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: checkError } = await (admin as any)
    .from('promo_redemptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('code', code)
    .maybeSingle()

  if (checkError) {
    return NextResponse.json(
      { error: 'Promo system not ready. Ask support to run the promo migration.' },
      { status: 503 }
    )
  }

  if (existing) {
    return NextResponse.json({ error: 'You already redeemed this code.' }, { status: 409 })
  }

  // Award credits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()

  const newCredits = (profile?.credits ?? 0) + promo.creditsAwarded

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('profiles').update({ credits: newCredits }).eq('id', user.id)

  // Record redemption
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('promo_redemptions').insert({
    user_id: user.id,
    code,
    credits_awarded: promo.creditsAwarded,
  })

  return NextResponse.json({
    ok: true,
    creditsAwarded: promo.creditsAwarded,
    newCredits,
    description: promo.description,
  })
}
