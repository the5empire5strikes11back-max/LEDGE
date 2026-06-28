import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  rankFromXP,
  RANK_DAILY_MULTIPLIER,
  BASE_DAILY_DROP,
  rollChestTier,
  chestAmount,
} from '@/lib/game-engine'
import { rateLimit } from '@/lib/rate-limit'
import { advanceStreak } from '@/lib/streak'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if already claimed today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: existing } = await supabase
    .from('daily_drops')
    .select('claimed_at')
    .eq('user_id', user.id)
    .gte('claimed_at', today.toISOString())
    .maybeSingle()

  return NextResponse.json({ claimed: !!existing })
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // The client sends its local calendar date so the streak day flips at the
  // user's local midnight. Validate the shape; fall back to UTC date if missing.
  const body = await request.json().catch(() => ({}))
  const localDate = typeof body?.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.localDate)
    ? body.localDate
    : new Date().toISOString().slice(0, 10)

  // Rate limit: max 5 attempts per minute (idempotent check below guards actual grant)
  const admin = createAdminClient()
  const rl = await rateLimit(admin, { key: `${user.id}:daily-drop`, limit: 5, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // Check if already claimed today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: existing } = await supabase
    .from('daily_drops')
    .select('id')
    .eq('user_id', user.id)
    .gte('claimed_at', today.toISOString())
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Already claimed today' }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('credits, xp, streak, last_active_at, is_plus, last_streak_date, streak_freezes')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const rank = rankFromXP(profile.xp)
  const multiplier = RANK_DAILY_MULTIPLIER[rank]

  // Streak bonus: 50 per day after day 3
  const streakBonus = profile.streak >= 3 ? Math.min(profile.streak * 50, 1000) : 0
  const baseAmount = BASE_DAILY_DROP
  const dropAmount = Math.floor(baseAmount * multiplier) + streakBonus

  // 25% chance of mystery chest
  let chestTier = null
  let chestCredits = 0

  if (Math.random() < 0.25) {
    chestTier = rollChestTier()
    chestCredits = chestAmount(chestTier)
  }

  const totalGain = dropAmount + chestCredits

  // Advance the streak through the single source of truth. Missed days are
  // auto-covered by freezes; 7-day milestones grant one. Idempotent per local day.
  const streakResult = advanceStreak(
    {
      streak: profile.streak ?? 0,
      lastStreakDate: profile.last_streak_date ?? null,
      freezes: profile.streak_freezes ?? 0,
    },
    localDate,
  )
  const newStreak = streakResult.streak

  // Save drop record + credit the drop via the service-role client. Direct
  // writes to daily_drops and profiles are revoked for the authenticated role:
  // otherwise a user could delete their daily_drops row and re-claim the credit
  // grant repeatedly, or set their own credits directly. user_id is pinned to
  // the verified session.
  await admin.from('daily_drops').insert({
    user_id: user.id,
    amount: dropAmount,
    chest_tier: chestTier,
    chest_amount: chestCredits,
  })

  // Update profile
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated } = await (admin as any)
    .from('profiles')
    .update({
      credits: profile.credits + totalGain,
      streak: newStreak,
      last_streak_date: streakResult.lastStreakDate,
      streak_freezes: streakResult.freezes,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select()
    .single()

  return NextResponse.json({
    dropAmount,
    streakBonus,
    multiplier,
    rank,
    chestTier,
    chestCredits,
    newStreak,
    streakOutcome: streakResult.outcome,         // started | extended | frozen | reset | already
    freezesUsed: streakResult.freezesConsumed,   // freezes auto-consumed to save the streak
    freezeGranted: streakResult.freezeGranted,   // a milestone awarded a freeze
    freezes: streakResult.freezes,               // remaining freeze inventory
    profile: updated,
  })
}
