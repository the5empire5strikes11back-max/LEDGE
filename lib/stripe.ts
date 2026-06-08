import Stripe from 'stripe'

// ── Server-side Stripe instance (lazy — only created inside request handlers) ─
let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key)
  }
  return _stripe
}

// ── Credit packs ──────────────────────────────────────────────────────────────
// Psychological pricing: all under key thresholds to feel like impulse buys

export const CREDIT_PACKS = [
  {
    id:          'starter',
    label:       'Quick Top-up',
    credits:     1_000,
    price:       0.99,
    priceId:     process.env.STRIPE_CREDITS_1000_PRICE_ID ?? '',
    description: 'A little boost',
    badge:       null,
  },
  {
    id:          'boost',
    label:       'Boost',
    credits:     2_500,
    price:       1.99,
    priceId:     process.env.STRIPE_CREDITS_2500_PRICE_ID ?? '',
    description: 'Most popular',
    badge:       'Popular',
  },
  {
    id:          'stack',
    label:       'Stack',
    credits:     7_000,
    price:       4.99,
    priceId:     process.env.STRIPE_CREDITS_7000_PRICE_ID ?? '',
    description: 'Best value',
    badge:       'Best Value',
  },
] as const

export type CreditPackId = typeof CREDIT_PACKS[number]['id']

// ── Plus subscription ─────────────────────────────────────────────────────────
export const PLUS_PRICE_ID = process.env.STRIPE_PLUS_PRICE_ID ?? ''
export const PLUS_YEARLY_PRICE = 20 // $20/yr

// ── Helpers ───────────────────────────────────────────────────────────────────
export function getCreditPack(id: CreditPackId) {
  return CREDIT_PACKS.find((p) => p.id === id) ?? null
}
