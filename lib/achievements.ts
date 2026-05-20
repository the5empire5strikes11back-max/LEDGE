/**
 * Achievement definitions and server-side computation.
 * Computed entirely from existing bet + market data — no new table needed.
 */

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface Achievement {
  id: string
  label: string
  description: string
  emoji: string
  rarity: AchievementRarity
}

export const ACHIEVEMENTS: Record<string, Achievement> = {
  // ── Common ────────────────────────────────────────────────────────────────
  first_blood: {
    id: 'first_blood', label: 'First Blood',
    description: 'Placed your first bet', emoji: '🎯', rarity: 'common',
  },
  hot_streak: {
    id: 'hot_streak', label: 'Hot Streak',
    description: '3 wins in a row', emoji: '🔥', rarity: 'common',
  },

  // ── Rare ─────────────────────────────────────────────────────────────────
  oracle_streak: {
    id: 'oracle_streak', label: 'Oracle Streak',
    description: '5 wins in a row', emoji: '🔮', rarity: 'rare',
  },
  sports_savant: {
    id: 'sports_savant', label: 'Sports Savant',
    description: '10 Sports wins', emoji: '🏆', rarity: 'rare',
  },
  political_animal: {
    id: 'political_animal', label: 'Political Animal',
    description: '10 Politics wins', emoji: '📊', rarity: 'rare',
  },
  culture_vulture: {
    id: 'culture_vulture', label: 'Culture Vulture',
    description: '10 Culture wins', emoji: '🎬', rarity: 'rare',
  },

  // ── Epic ─────────────────────────────────────────────────────────────────
  crystal_ball: {
    id: 'crystal_ball', label: 'Crystal Ball',
    description: '70%+ win rate with 15+ bets', emoji: '🔭', rarity: 'epic',
  },
  comeback_kid: {
    id: 'comeback_kid', label: 'Comeback Kid',
    description: 'Won after 3 straight losses', emoji: '⚡', rarity: 'epic',
  },
  whale: {
    id: 'whale', label: 'Whale',
    description: 'Single bet over 10K CR', emoji: '🐳', rarity: 'epic',
  },

  // ── Legendary ─────────────────────────────────────────────────────────────
  diamond_hands: {
    id: 'diamond_hands', label: 'Diamond Hands',
    description: 'Wagered 50K+ CR total', emoji: '💎', rarity: 'legendary',
  },
  the_oracle: {
    id: 'the_oracle', label: 'The Oracle',
    description: '10-win streak — undeniable', emoji: '👁️', rarity: 'legendary',
  },
}

export interface BetForAchievement {
  won: boolean | null
  amount: number
  category: string
}

/** Compute which achievements a user has earned from their resolved bet history. */
export function computeAchievements(bets: BetForAchievement[]): Achievement[] {
  const resolved = bets.filter((b) => b.won !== null)
  const totalBets = bets.length
  const wonBets = resolved.filter((b) => b.won).length
  const totalWagered = bets.reduce((s, b) => s + b.amount, 0)

  // Consecutive win tracking
  let maxStreak = 0
  let currentStreak = 0
  let hadComeback = false
  let lossRun = 0

  for (const bet of resolved) {
    if (bet.won) {
      if (lossRun >= 3) hadComeback = true
      lossRun = 0
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 0
      lossRun++
    }
  }

  // Category wins
  const sportsWins = resolved.filter((b) => b.won && b.category === 'Sports').length
  const politicsWins = resolved.filter((b) => b.won && b.category === 'Politics').length
  const cultureWins = resolved.filter((b) => b.won && b.category === 'Culture').length

  // Max single bet
  const maxBet = bets.reduce((m, b) => Math.max(m, b.amount), 0)
  const winRate = resolved.length >= 15 ? wonBets / resolved.length : 0

  const earned: Achievement[] = []
  const add = (id: string) => { if (ACHIEVEMENTS[id]) earned.push(ACHIEVEMENTS[id]) }

  if (totalBets >= 1)        add('first_blood')
  if (maxStreak >= 3)        add('hot_streak')
  if (maxStreak >= 5)        add('oracle_streak')
  if (maxStreak >= 10)       add('the_oracle')
  if (sportsWins >= 10)      add('sports_savant')
  if (politicsWins >= 10)    add('political_animal')
  if (cultureWins >= 10)     add('culture_vulture')
  if (winRate >= 0.70)       add('crystal_ball')
  if (hadComeback)           add('comeback_kid')
  if (maxBet >= 10_000)      add('whale')
  if (totalWagered >= 50_000) add('diamond_hands')

  return earned
}
