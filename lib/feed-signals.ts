/**
 * Feed Signal Engine — Compound State + Identity Signals
 *
 * Computes cross-system compound states and persona-driven identity signals
 * for each market card. This is the "systems talking to each other" layer:
 * hot + momentum → surging, social + whale → whale-zone, etc.
 *
 * Architecture:
 *   - CompoundState: market-level signal derived from multiple existing signals
 *   - IdentitySignal: user-level signal derived from persona + streak + category
 *   - Both are pure functions — no side effects, easy to test
 */

import type { MarketSocialData } from "@/lib/social-signals"
import type { Persona } from "@/lib/game-engine"

// ── Compound State ─────────────────────────────────────────────────────────────
//
// Priority order (highest wins):
//   surging    = hot + meaningful momentum shift — the market is exploding
//   whale-zone = large bet activity detected in social signals
//   contested  = high tension (near 50/50) + active momentum
//   hot        = high engagement score, stable odds
//   moving     = odds shifting but not yet hot
//   normal     = baseline, no notable signals

export type CompoundState =
  | "surging"
  | "whale-zone"
  | "contested"
  | "hot"
  | "moving"
  | "normal"

const SURGING_HOT_THRESHOLD      = 8    // hotScore to qualify as "hot"
const SURGING_MOMENTUM_THRESHOLD = 5    // momentum pp to qualify for surging
const CONTESTED_TENSION_RANGE    = 15   // ±15 from 50 = contested zone
const CONTESTED_MOMENTUM_MIN     = 3    // momentum pp needed for "contested" label

export function computeCompoundState(
  hotScore: number,
  momentumShift: number,
  yesPercent: number,
  social: MarketSocialData | null | undefined
): CompoundState {
  const isHot      = hotScore >= SURGING_HOT_THRESHOLD
  const hasMomentum = momentumShift >= SURGING_MOMENTUM_THRESHOLD
  const tension    = Math.abs(yesPercent - 50)
  const isContested = tension <= CONTESTED_TENSION_RANGE

  // Surging: hot market with rapid odds movement — highest priority
  if (isHot && hasMomentum) return "surging"

  // Whale zone: large single bet flagged via social signals
  if (social?.hasWhaleBet) {
    return "whale-zone"
  }

  // Contested: near 50/50 AND moving — maximum drama
  if (isContested && momentumShift >= CONTESTED_MOMENTUM_MIN) return "contested"

  // Hot: high engagement, stable
  if (isHot) return "hot"

  // Moving: odds are shifting
  if (momentumShift >= CONTESTED_MOMENTUM_MIN) return "moving"

  return "normal"
}

// ── Identity Signal ────────────────────────────────────────────────────────────
//
// Shows on cards when a user's persona makes this specific market personally
// relevant to their betting identity. Creates the "this is YOUR kind of market"
// feeling that amplifies engagement.

export type IdentitySignalType =
  | "contrarian-edge"   // user is Contrarian + market has strong majority (>68%)
  | "oracle-momentum"   // user has win streak ≥ 5
  | "category-mastery"  // user's dominant bet category matches this market
  | "comeback-mode"     // user is on a loss streak, this is a chance to recover

export interface IdentitySignal {
  type: IdentitySignalType
  label: string
  color: string  // Tailwind color token, e.g. "text-accent"
}

const CONTRARIAN_MAJORITY_THRESHOLD = 68   // yes% must be ≥ this for contrarian edge
const ORACLE_STREAK_THRESHOLD       = 5    // win streak count for oracle momentum
const MASTERY_BET_SHARE             = 0.55 // fraction of bets in one category to qualify

/** Category distribution from bet history */
export interface BetCategoryStats {
  Sports:   number
  Politics: number
  Culture:  number
  Circle:   number
  total:    number
}

export function buildCategoryStats(
  betHistory: Array<{ category: string }>
): BetCategoryStats {
  const stats: BetCategoryStats = { Sports: 0, Politics: 0, Culture: 0, Circle: 0, total: 0 }
  for (const b of betHistory) {
    const cat = b.category as keyof Omit<BetCategoryStats, "total">
    if (cat in stats) {
      stats[cat]++
      stats.total++
    }
  }
  return stats
}

/** Derive the user's dominant category (or null if no clear preference) */
export function dominantCategory(
  stats: BetCategoryStats
): "Sports" | "Politics" | "Culture" | null {
  if (stats.total < 3) return null
  const categories: Array<"Sports" | "Politics" | "Culture"> = ["Sports", "Politics", "Culture"]
  for (const cat of categories) {
    if (stats[cat] / stats.total >= MASTERY_BET_SHARE) return cat
  }
  return null
}

export function computeIdentitySignal(
  marketCategory: string,
  yesPercent: number,
  persona: Pick<Persona, "id"> | null,
  winStreak: number,
  isComeback: boolean,
  categoryStats: BetCategoryStats
): IdentitySignal | null {
  if (!persona) return null

  // Comeback mode beats everything — most emotionally charged state
  if (isComeback) {
    return {
      type: "comeback-mode",
      label: "Comeback shot",
      color: "text-white/70",
    }
  }

  // Contrarian edge: user bets against crowds — flag strong majority markets
  if (
    persona.id === "contrarian" &&
    (yesPercent >= CONTRARIAN_MAJORITY_THRESHOLD || yesPercent <= (100 - CONTRARIAN_MAJORITY_THRESHOLD))
  ) {
    const side = yesPercent >= CONTRARIAN_MAJORITY_THRESHOLD ? "YES" : "NO"
    return {
      type: "contrarian-edge",
      label: `Contrarian edge — ${Math.round(yesPercent >= 50 ? yesPercent : 100 - yesPercent)}% on ${side}`,
      color: "text-purple-400",
    }
  }

  // Oracle momentum: win streak is active
  if (persona.id === "oracle" && winStreak >= ORACLE_STREAK_THRESHOLD) {
    return {
      type: "oracle-momentum",
      label: `Oracle momentum — ${winStreak} win streak`,
      color: "text-accent",
    }
  }

  // Category mastery: dominant category matches this market
  const dominant = dominantCategory(categoryStats)
  if (dominant && dominant === marketCategory) {
    const labels: Record<string, string> = {
      Sports:   "Your domain",
      Politics: "Your domain",
      Culture:  "Your domain",
    }
    return {
      type: "category-mastery",
      label: labels[marketCategory] ?? "Your domain",
      color: "text-muted-foreground/60",
    }
  }

  return null
}
