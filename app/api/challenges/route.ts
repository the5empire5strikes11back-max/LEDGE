import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export interface DailyChallenge {
  id: string
  label: string
  description: string
  emoji: string
  xp: number
  type: 'bet_count' | 'bet_category' | 'win_count' | 'underdog'
  target: number
  progress: number
  completed: boolean
  /** Category for bet_category challenges */
  category?: string
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const dayOfYear = getDayOfYear(now)
  const dayOfWeek = now.getDay() // 0=Sun … 6=Sat

  // ── Start of today UTC (for counting today's bets) ──────────────────────
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)

  const { data: todayBets } = await supabase
    .from('bets')
    .select('amount, payout, won, markets(category)')
    .eq('user_id', user.id)
    .gte('created_at', todayStart.toISOString())

  const bets = (todayBets ?? []) as Array<{
    amount: number
    payout: number | null
    won: boolean | null
    markets: { category: string } | null
  }>

  // ── Challenge 1 — Participation (bet_count, target varies by day) ────────
  // Weekend: target 2, weekday: target 1 except Wed/Thu → 2
  const betTarget = [1, 1, 1, 2, 2, 2, 1][dayOfWeek]
  const betLabel  = betTarget === 1 ? 'First Move'    : 'Active Trader'
  const betDesc   = betTarget === 1 ? 'Place 1 bet today' : 'Place 2 bets today'
  const betXp     = betTarget === 1 ? 20              : 40
  const betProgress = bets.length
  const challenge1: DailyChallenge = {
    id: `bet_count_${betTarget}`,
    label: betLabel,
    description: betDesc,
    emoji: '🎯',
    xp: betXp,
    type: 'bet_count',
    target: betTarget,
    progress: Math.min(betProgress, betTarget),
    completed: betProgress >= betTarget,
  }

  // ── Challenge 2 — Category bet (rotates Sports → Politics → Culture) ─────
  const CATEGORIES = ['Sports', 'Politics', 'Culture'] as const
  const cat = CATEGORIES[dayOfYear % 3]
  const CAT_EMOJI: Record<typeof CATEGORIES[number], string> = {
    Sports: '🏆', Politics: '📰', Culture: '🎬',
  }
  const CAT_LABEL: Record<typeof CATEGORIES[number], string> = {
    Sports: 'Sports Call', Politics: 'Political Play', Culture: 'Culture Read',
  }
  const catBets = bets.filter((b) => b.markets?.category === cat).length
  const challenge2: DailyChallenge = {
    id: `cat_${cat.toLowerCase()}`,
    label: CAT_LABEL[cat],
    description: `Bet on a ${cat} market`,
    emoji: CAT_EMOJI[cat],
    xp: 25,
    type: 'bet_category',
    target: 1,
    progress: Math.min(catBets, 1),
    completed: catBets >= 1,
    category: cat,
  }

  // ── Challenge 3 — Skill (alternates underdog ↔ win) ─────────────────────
  // "Underdog": placed a bet where payout > 2× amount (i.e., side at < 50%)
  // "Win":      won a bet today
  const isUnderdogDay = dayOfYear % 2 === 0
  let challenge3: DailyChallenge

  if (isUnderdogDay) {
    const underdogCount = bets.filter((b) => b.payout !== null && b.payout > b.amount * 2).length
    challenge3 = {
      id: 'underdog',
      label: 'Contrarian',
      description: 'Bet on the underdog (below 50%)',
      emoji: '🎭',
      xp: 35,
      type: 'underdog',
      target: 1,
      progress: Math.min(underdogCount, 1),
      completed: underdogCount >= 1,
    }
  } else {
    const winCount = bets.filter((b) => b.won === true).length
    challenge3 = {
      id: 'win_today',
      label: 'Winner',
      description: 'Win a bet today',
      emoji: '✅',
      xp: 50,
      type: 'win_count',
      target: 1,
      progress: Math.min(winCount, 1),
      completed: winCount >= 1,
    }
  }

  return NextResponse.json([challenge1, challenge2, challenge3])
}
