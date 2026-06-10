/**
 * Category balance — single source of truth for per-category capacity.
 *
 * The feed must feel alive without any one category bloating it. Two bounds:
 *   FLOOR   — fill up to here first; below it a category is "underfilled".
 *   CEILING — hard cap; at/above it a category is "full" and the generation
 *             pipeline stops adding to it (candidates are rerouted/dropped).
 *
 * Both the release cron (fills floors) and the generation pipeline (enforces
 * ceilings) read these numbers, so balance policy lives in exactly one place.
 */

/** Floor: minimum live, non-resolved markets a category should hold. */
export const CATEGORY_FLOORS: Record<string, number> = {
  Sports:   15,
  Culture:  15,
  Politics: 15,
  Tech:     15,
  Viral:    15,
  Wild:     15,
}

/** Ceiling: hard cap on live markets per category. At/above → stop adding. */
export const CATEGORY_CEILINGS: Record<string, number> = {
  Sports:   25,
  Culture:  25,
  Politics: 25,
  Tech:     25,
  Viral:    25,
  Wild:     25,
}

/** Default bounds for any category not explicitly listed above. */
export const DEFAULT_FLOOR = 5
export const DEFAULT_CEILING = 25

export function floorFor(category: string): number {
  return CATEGORY_FLOORS[category] ?? DEFAULT_FLOOR
}

export function ceilingFor(category: string): number {
  return CATEGORY_CEILINGS[category] ?? DEFAULT_CEILING
}

export type CategoryStatus = 'underfilled' | 'healthy' | 'full'

/** Classify a category by its current live-market count. */
export function categoryStatus(category: string, liveCount: number): CategoryStatus {
  if (liveCount < floorFor(category)) return 'underfilled'
  if (liveCount >= ceilingFor(category)) return 'full'
  return 'healthy'
}

/** True when a category is at or above its hard ceiling (no more may be added). */
export function isCategoryFull(category: string, liveCounts: Map<string, number>): boolean {
  return (liveCounts.get(category) ?? 0) >= ceilingFor(category)
}

/** Categories at/above ceiling — the generator should avoid these. */
export function fullCategories(liveCounts: Map<string, number>): string[] {
  return Object.keys(CATEGORY_CEILINGS).filter((c) => isCategoryFull(c, liveCounts))
}

/** Categories below floor — the generator should prioritize these. */
export function underfilledCategories(liveCounts: Map<string, number>): string[] {
  return Object.keys(CATEGORY_FLOORS).filter(
    (c) => (liveCounts.get(c) ?? 0) < floorFor(c)
  )
}

/**
 * Remaining live-market headroom before a category hits its ceiling.
 * Returns 0 when already full. Used to bound how many of a category the
 * generation pipeline may publish in one pass.
 */
export function headroom(category: string, liveCounts: Map<string, number>): number {
  return Math.max(0, ceilingFor(category) - (liveCounts.get(category) ?? 0))
}
