import type { RankKey } from "@/components/user-profile-card"

export const RANK_ORDER: RankKey[] = [
  "rookie", "forecaster", "analyst", "oracle", "marketMaker", "juryLead"
]

export const RANK_XP_THRESHOLDS: Record<RankKey, number> = {
  rookie: 0,
  forecaster: 500,
  analyst: 1500,
  oracle: 4000,
  marketMaker: 10000,
  juryLead: 25000,
}

export const RANK_DAILY_MULTIPLIER: Record<RankKey, number> = {
  rookie: 1,
  forecaster: 1.25,
  analyst: 1.5,
  oracle: 2,
  marketMaker: 2.5,
  juryLead: 3,
}

export const BASE_DAILY_DROP = 500
export const XP_PER_BET = 10
export const XP_PER_WIN = 50

// Anti-Sybil: cap bets inside user-created Circle markets
export const CIRCLE_BET_MAX_CR = 2_000

// Hot market threshold — markets with this many bets show the 🔥 badge
export const HOT_MARKET_THRESHOLD = 8

// Momentum threshold — show odds-shift arrow when yes_percent moved this much in one bet
export const MOMENTUM_SHIFT_THRESHOLD = 3

// Comeback bonus — XP multiplier when comeback_eligible flag is set
export const COMEBACK_XP_BONUS = 60   // extra XP on top of normal win XP
export const COMEBACK_LOSS_TRIGGER = 3 // consecutive losses before eligible

// Whale alert threshold for push notifications
export const WHALE_BET_THRESHOLD = 10_000

// Margin loan limits
export const MARGIN_LOAN_FREE_CR = 500
export const MARGIN_LOAN_PLUS_CR = 5_000

export function marginLoanCap(isPlus: boolean): number {
  return isPlus ? MARGIN_LOAN_PLUS_CR : MARGIN_LOAN_FREE_CR
}

export function rankFromXP(xp: number): RankKey {
  for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
    if (xp >= RANK_XP_THRESHOLDS[RANK_ORDER[i]]) return RANK_ORDER[i]
  }
  return "rookie"
}

export function xpProgress(xp: number): { rank: RankKey; current: number; required: number; percent: number; nextRank: RankKey | null } {
  const rank = rankFromXP(xp)
  const rankIndex = RANK_ORDER.indexOf(rank)
  const nextRank = rankIndex < RANK_ORDER.length - 1 ? RANK_ORDER[rankIndex + 1] : null
  const current = xp - RANK_XP_THRESHOLDS[rank]
  const required = nextRank ? RANK_XP_THRESHOLDS[nextRank] - RANK_XP_THRESHOLDS[rank] : 1
  const percent = Math.min((current / required) * 100, 100)
  return { rank, current, required, percent, nextRank }
}

// Mystery chest tiers
export type ChestTier = "common" | "rare" | "epic" | "legendary"

export function rollChestTier(): ChestTier {
  const roll = Math.random()
  if (roll < 0.60) return "common"
  if (roll < 0.85) return "rare"
  if (roll < 0.97) return "epic"
  return "legendary"
}

export const CHEST_AMOUNTS: Record<ChestTier, { min: number; max: number; label: string; color: string }> = {
  common:    { min: 300,   max: 600,   label: "Common",    color: "#6B6B7B" },
  rare:      { min: 800,   max: 1500,  label: "Rare",      color: "#3B82F6" },
  epic:      { min: 2000,  max: 4000,  label: "Epic",      color: "#A855F7" },
  legendary: { min: 8000,  max: 15000, label: "Legendary", color: "#F5A623" },
}

export function chestAmount(tier: ChestTier): number {
  const { min, max } = CHEST_AMOUNTS[tier]
  return Math.floor(min + Math.random() * (max - min))
}

// Prediction Persona
export type Persona = {
  id: string
  label: string
  description: string
  emoji: string
}

export interface BetRecord {
  category: "Sports" | "Politics" | "Culture" | "Circle"
  side: "yes" | "no"
  majorityWas: "yes" | "no"
  won: boolean
}

export function calculatePersona(bets: BetRecord[]): Persona {
  if (bets.length === 0) return PERSONAS.newcomer

  const wins = bets.filter(b => b.won).length
  const winRate = wins / bets.length

  const sportsBets = bets.filter(b => b.category === "Sports").length
  const politicsBets = bets.filter(b => b.category === "Politics").length
  const contrarian = bets.filter(b => b.side !== b.majorityWas).length / bets.length
  const yesBets = bets.filter(b => b.side === "yes").length / bets.length

  if (winRate >= 0.70) return PERSONAS.oracle
  if (contrarian >= 0.60) return PERSONAS.contrarian
  if (sportsBets / bets.length >= 0.60) return PERSONAS.sportsSavant
  if (politicsBets / bets.length >= 0.50) return PERSONAS.politicalAnalyst
  if (yesBets >= 0.70) return PERSONAS.optimist
  if (yesBets <= 0.30) return PERSONAS.pessimist
  return PERSONAS.analyst
}

export const PERSONAS: Record<string, Persona> = {
  newcomer:        { id: "newcomer",        label: "The Newcomer",          description: "Just getting started. Your legend begins now.",          emoji: "🌱" },
  oracle:          { id: "oracle",          label: "The Oracle",            description: "Eerily accurate. You see things others don't.",           emoji: "🔮" },
  contrarian:      { id: "contrarian",      label: "The Contrarian",        description: "You love betting against the crowd — and winning.",        emoji: "🎭" },
  sportsSavant:    { id: "sportsSavant",    label: "The Sports Savant",     description: "Game stats are your first language.",                     emoji: "🏆" },
  politicalAnalyst:{ id: "politicalAnalyst",label: "The Political Analyst", description: "You read between the headlines while others skim them.",   emoji: "📊" },
  optimist:        { id: "optimist",        label: "The Optimist",          description: "You believe. Sometimes that's enough.",                   emoji: "☀️" },
  pessimist:       { id: "pessimist",       label: "The Pessimist",         description: "You see the downside before anyone else. Often correct.",  emoji: "🌧️" },
  analyst:         { id: "analyst",         label: "The Analyst",           description: "Balanced. Methodical. Data before emotion.",              emoji: "📈" },
}

// Veto power — gained at streak milestones. Plus subscribers get an extra slot.
export function vetoesFromStreak(streak: number, isPlus = false): number {
  const cap = isPlus ? 4 : 3
  if (streak >= 30) return cap
  if (streak >= 14) return Math.min(2, cap)
  if (streak >= 7) return 1
  return 0
}

/**
 * Fixed-odds payout locked at the moment a bet is placed.
 * impliedProbabilityPct is the market's yes_percent (or 100 - yes_percent for NO bets).
 * 5% house cut applied.
 * Example: bet 1000 CR on YES at 60% → payout = floor(1000 × (100/60) × 0.95) = 1583 CR
 */
export function calculateFixedOddsPayout(
  betAmount: number,
  impliedProbabilityPct: number
): number {
  if (impliedProbabilityPct <= 0 || impliedProbabilityPct >= 100) return betAmount
  return Math.floor(betAmount * (100 / impliedProbabilityPct) * 0.95)
}

// Rank decay: days since last active before decay starts
export const DECAY_THRESHOLD_DAYS = 2

export function decayLevel(daysSinceActive: number): "none" | "warning" | "critical" {
  if (daysSinceActive <= DECAY_THRESHOLD_DAYS) return "none"
  if (daysSinceActive <= 5) return "warning"
  return "critical"
}
