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

export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    .select('credits, xp, streak, last_active_at, is_plus, streak_freeze_used_at')
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

  // Check if streak continues (last active within 48 hours)
  const lastActive = new Date(profile.last_active_at ?? 0)
  const hoursSinceActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60)

  // Streak freeze: earned every 7 days of streak (max 3 shields), consumed when gap > 48h
  // Plus members get shields; free users get 1 shield per 7-day milestone (capped at 1 without Plus)
  const shieldsEarned = profile.is_plus
    ? Math.min(Math.floor((profile.streak ?? 0) / 7), 3)
    : Math.min(Math.floor((profile.streak ?? 0) / 7), 1)

  const freezeLastUsed = profile.streak_freeze_used_at ? new Date(profile.streak_freeze_used_at) : null
  const daysSinceFreezeUsed = freezeLastUsed
    ? (Date.now() - freezeLastUsed.getTime()) / 86_400_000
    : Infinity
  const freezeAvailable = shieldsEarned > 0 && daysSinceFreezeUsed > 7

  const streakBroken = hoursSinceActive > 48
  const freezeUsed   = streakBroken && freezeAvailable

  let newStreak: number
  let streakFreezeUsedAt: string | null = profile.streak_freeze_used_at ?? null

  if (!streakBroken) {
    newStreak = (profile.streak ?? 0) + 1
  } else if (freezeUsed) {
    // Freeze absorbed the miss — keep streak, mark freeze consumed
    newStreak = (profile.streak ?? 0) + 1
    streakFreezeUsedAt = new Date().toISOString()
  } else {
    newStreak = 1
  }

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
      last_active_at: new Date().toISOString(),
      ...(freezeUsed && { streak_freeze_used_at: streakFreezeUsedAt }),
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
    freezeUsed,
    shieldsRemaining: freezeUsed ? Math.max(0, shieldsEarned - 1) : shieldsEarned,
    profile: updated,
  })
}
