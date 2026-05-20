import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  rankFromXP,
  RANK_DAILY_MULTIPLIER,
  BASE_DAILY_DROP,
  rollChestTier,
  chestAmount,
} from '@/lib/game-engine'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits, xp, streak, last_active_at')
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
  const lastActive = new Date(profile.last_active_at)
  const hoursSinceActive = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60)
  const newStreak = hoursSinceActive <= 48 ? profile.streak + 1 : 1

  // Save drop record
  await supabase.from('daily_drops').insert({
    user_id: user.id,
    amount: dropAmount,
    chest_tier: chestTier,
    chest_amount: chestCredits,
  })

  // Update profile
  const { data: updated } = await supabase
    .from('profiles')
    .update({
      credits: profile.credits + totalGain,
      streak: newStreak,
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
    profile: updated,
  })
}
