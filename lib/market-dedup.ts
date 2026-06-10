/**
 * Semantic near-duplicate detection for AI-generated markets.
 *
 * Token-overlap (Jaccard, in lib/market-quality) catches markets written with
 * nearly the same WORDS, but misses semantic clones written with different
 * words — "Will the Yankees beat the Red Sox?" vs "Will the Yankees win
 * tonight?" describe the same event yet share few tokens.
 *
 * This module collapses those by reducing each title to a coarse signature:
 *   (set of proper-noun subjects) × (one coarse action bucket)
 * Two markets are semantic duplicates when they share an action bucket AND
 * their subject sets intersect. The action bucket maps synonyms to one label
 * (win/beat/defeat → WIN; homer/go deep/HR → HOMER), so phrasing differences
 * collapse while genuinely different events (same team, different action) stay
 * distinct.
 *
 * Conservative by design: when no action bucket is recognized we return null
 * and skip the entity cap entirely, deferring to the lexical Jaccard check so
 * we never over-collapse unfamiliar question shapes.
 */

/** Coarse action buckets — first match wins. Order matters (specific first). */
const ACTION_BUCKETS: { bucket: string; pattern: RegExp }[] = [
  { bucket: 'HOMER',      pattern: /\b(home\s?runs?|homers?|go(?:es)?\s+deep|went\s+deep|long\s?ball|hr)\b/i },
  { bucket: 'DISCIPLINE', pattern: /\b(eject(?:ed)?|flagrant|technical\s+foul|red\s+card|sent\s+off|suspend(?:ed)?|foul\s+called)\b/i },
  { bucket: 'STAT',       pattern: /\b(average|averages|ppg|points?|yards?|goals?|assists?|rebounds?|strikeouts?)\b/i },
  { bucket: 'QUALIFY',    pattern: /\b(qualify|qualifies|playoffs?|postseason|advance[sd]?|clinch(?:es)?|knockout\s+stage)\b/i },
  { bucket: 'POST',       pattern: /\b(post|posts|respond|responds|reply|replies|announce[sd]?|tweet|tweets|drop|drops|release[sd]?|address(?:es)?)\b/i },
  { bucket: 'WIN',        pattern: /\b(win|wins|won|beat|beats|defeat|defeats|overcome|overcomes|tops?|upset|upsets|victory)\b/i },
]

/** Capitalized words that are not real subjects (sentence scaffolding). */
const STOP_PROPER = new Set([
  'Will', 'The', 'A', 'An', 'This', 'That', 'These', 'Those', 'His', 'Her',
  'Their', 'Its', 'Next', 'Another', 'Again', 'Tonight', 'Today', 'Tomorrow',
  'Within', 'Of', 'In', 'On', 'At', 'To', 'By', 'For', 'And', 'Or', 'But',
])

export interface MarketSignature {
  nouns: Set<string>
  action: string
}

/** Extract proper-noun subjects (lowercased, possessive-stripped) from a title. */
function properNouns(title: string): Set<string> {
  const set = new Set<string>()
  const tokens = title.match(/[A-Z][a-zA-Z]+(?:'s)?/g) ?? []
  for (const raw of tokens) {
    const t = raw.replace(/'s$/, '')
    if (t.length < 3 || STOP_PROPER.has(t)) continue
    set.add(t.toLowerCase())
  }
  return set
}

/** Map a title to its coarse action bucket, or null if none is recognized. */
function actionBucket(title: string): string | null {
  for (const { bucket, pattern } of ACTION_BUCKETS) {
    if (pattern.test(title)) return bucket
  }
  return null
}

/**
 * Reduce a title to its (subjects × action) signature, or null when no action
 * bucket or no subject is confidently identified (skip the entity cap then).
 */
export function marketSignature(title: string): MarketSignature | null {
  const action = actionBucket(title)
  if (!action) return null
  const nouns = properNouns(title)
  if (nouns.size === 0) return null
  return { nouns, action }
}

/**
 * True when `candidate` is a semantic duplicate of any already-accepted
 * signature: same action bucket AND at least one shared subject.
 */
export function isSemanticDuplicate(
  candidate: MarketSignature,
  accepted: MarketSignature[]
): boolean {
  for (const a of accepted) {
    if (a.action !== candidate.action) continue
    for (const n of candidate.nouns) {
      if (a.nouns.has(n)) return true
    }
  }
  return false
}
