import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/server'
import type Stripe from 'stripe'

export async function POST(request: Request) {
  const body      = await request.text()
  const signature = request.headers.get('stripe-signature') ?? ''
  const secret    = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()

  switch (event.type) {

    // ── One-time credit purchase completed ───────────────────────────────────
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId  = session.metadata?.userId
      const type    = session.metadata?.type

      if (!userId) break

      if (type === 'credits') {
        const creditsToAdd = parseInt(session.metadata?.credits ?? '0', 10)
        if (creditsToAdd > 0) {
          // Fetch current credits and add
          const { data: profile } = await admin
            .from('profiles')
            .select('credits')
            .eq('id', userId)
            .single()

          if (profile) {
            await admin
              .from('profiles')
              .update({ credits: profile.credits + creditsToAdd })
              .eq('id', userId)
          }
        }
      }

      if (type === 'plus') {
        // Subscription — also handle via invoice.payment_succeeded for renewals
        const subscriptionId = session.subscription as string | null
        await admin
          .from('profiles')
          .update({
            is_plus: true,
            stripe_subscription_id: subscriptionId,
          })
          .eq('id', userId)
      }

      break
    }

    // ── Subscription renewed (annual renewal) ────────────────────────────────
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      if (invoice.billing_reason !== 'subscription_cycle') break

      // Find user by stripe_customer_id
      const customerId = typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id

      if (!customerId) break

      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (profile) {
        await admin
          .from('profiles')
          .update({ is_plus: true })
          .eq('id', profile.id)
      }

      break
    }

    // ── Subscription cancelled or payment failed ──────────────────────────────
    case 'customer.subscription.deleted':
    case 'invoice.payment_failed': {
      const obj = event.data.object as { customer: string | { id: string } }
      const customerId = typeof obj.customer === 'string'
        ? obj.customer
        : obj.customer?.id

      if (!customerId) break

      const { data: profile } = await admin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single()

      if (profile) {
        await admin
          .from('profiles')
          .update({ is_plus: false, stripe_subscription_id: null })
          .eq('id', profile.id)
      }

      break
    }
  }

  return NextResponse.json({ received: true })
}
