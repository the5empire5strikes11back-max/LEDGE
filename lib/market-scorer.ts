/**
 * Market Quality Scoring System
 *
 * Runs between AI market generation and database insertion.
 * Uses a two-phase approach:
 *   1. Fast pattern-based pre-filter (disqualifies obviously bad markets instantly)
 *   2. Claude Haiku batch scoring on the remaining candidates
 *
 * Only markets with a weighted score >= REJECTION_THRESHOLD are accepted.
 * Rejected markets are returned with their scores and reasons for debugging.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { GeneratedMarket } from './market-generator'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MarketScores {
  emotional_relevance: number   // 1–10: Does Gen Z emotionally care about this?
  clarity: number               // 1–10: Understood in under 3 seconds?
  debate_potential: number      // 1–10: Can reasonable people genuinely disagree?
  time_tension: number          // 1–10: Resolves soon enough to stay exciting?
  social_discussability: number // 1–10: Would friends talk or argue about this?
  weighted_score: number        // Computed weighted average (1–10)
}

export interface ScoredMarket extends GeneratedMarket {
  quality_score: number // 1–100, stored in the DB (weighted_score × 10)
}

export interface RejectedMarket {
  market: GeneratedMarket
  scores: MarketScores
  reason: string
}

export interface ScoringResult {
  accepted: ScoredMarket[]
  rejected: RejectedMarket[]
  scoring_stats: {
    total_input: number
    instant_rejected: number
    ai_scored: number
    ai_accepted: number
    ai_rejected: number
    avg_accepted_score: number
  }
}

// ── Configuration ────────────────────────────────────────────────────────────

/**
 * Dimension weights — must sum to 1.0.
 * Emotional relevance is weighted highest because Gen Z engagement is the
 * primary metric. Clarity second because confusing markets don't get bets.
 */
const SCORE_WEIGHTS = {
  emotional_relevance:   0.30,
  clarity:               0.25,
  debate_potential:      0.20,
  time_tension:          0.15,
  social_discussability: 0.10,
} as const

/**
 * Markets with a weighted score below this threshold are rejected.
 * Scale is 1–10. 6.0 = "at least somewhat engaging and clear."
 */
const REJECTION_THRESHOLD = 6.0

// Minimum hours a market must have remaining to be accepted.
// A market with less than 2h until close has no meaningful betting window.
const MIN_HOURS_REMAINING = 2
// Maximum hours until close. Anything beyond 7 days loses urgency entirely.
const MAX_HOURS_REMAINING = 168

/**
 * Validate that a market's end_time is within the acceptable window.
 * Returns a rejection reason string, or null if valid.
 */
function checkEndTimeFreshness(market: GeneratedMarket): string | null {
  const endTime = new Date(market.end_time)
  if (isNaN(endTime.getTime())) {
    return `Invalid end_time value: "${market.end_time}"`
  }
  const hoursRemaining = (endTime.getTime() - Date.now()) / 3_600_000
  if (hoursRemaining < MIN_HOURS_REMAINING) {
    return `End time too soon — ${hoursRemaining.toFixed(1)}h remaining (minimum ${MIN_HOURS_REMAINING}h required)`
  }
  if (hoursRemaining > MAX_HOURS_REMAINING) {
    return `End time too far — ${(hoursRemaining / 24).toFixed(1)} days away (maximum ${MAX_HOURS_REMAINING / 24} days)`
  }
  return null
}

/**
 * Regex patterns that instantly disqualify markets regardless of score.
 * These signal corporate finance, complex legislation, expert-only topics,
 * or events that have clearly already occurred.
 */
const INSTANT_REJECT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /\b(GDP|CPI|inflation rate|basis points|treasury yield|earnings per share|EBITDA|fiscal deficit|balance sheet)\b/i,
    label: 'corporate finance jargon',
  },
  {
    pattern: /\b(q[1-4] earnings|quarterly revenue|profit guidance|operating margin|market cap)\b/i,
    label: 'earnings/revenue terminology',
  },
  {
    pattern: /\b(cloture|filibuster|quorum|parliamentary procedure|appropriations bill|reconciliation bill)\b/i,
    label: 'obscure legislative procedure',
  },
  {
    pattern: /\b(index fund|ETF|stock buyback|dividend yield|bond yield|futures contract|options contract)\b/i,
    label: 'financial instruments',
  },
  {
    pattern: /\b(central bank|interest rate hike|monetary policy|rate cut decision|fed meeting)\b/i,
    label: 'central banking / monetary policy',
  },
  {
    // Catches titles referencing a specific past year's championship/award/season
    // e.g. "2024 NBA Champion", "2025 Super Bowl winner", "last season's MVP"
    pattern: /\b(20(1[0-9]|2[0-5])\s+(champion|championship|winner|award|season|cup|title|mvp|playoff)|(last|previous)\s+(season|year|month|week)'?s?\b)/i,
    label: 'past-year or previous-season event',
  },
  {
    // Catches titles that describe something that already resolved
    // e.g. "Did X win", "Has X already", "Who won the"
    pattern: /^(did |has |who won |who is the (new|current|next) )/i,
    label: 'past-resolved or rhetorical question',
  },
]

// ── Core Logic ────────────────────────────────────────────────────────────────

function computeWeightedScore(
  scores: Omit<MarketScores, 'weighted_score'>
): number {
  return (
    scores.emotional_relevance   * SCORE_WEIGHTS.emotional_relevance +
    scores.clarity               * SCORE_WEIGHTS.clarity +
    scores.debate_potential      * SCORE_WEIGHTS.debate_potential +
    scores.time_tension          * SCORE_WEIGHTS.time_tension +
    scores.social_discussability * SCORE_WEIGHTS.social_discussability
  )
}

function clamp(value: number, min = 1, max = 10): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function checkInstantReject(market: GeneratedMarket): string | null {
  // End-time freshness check — catches expired or window-less markets
  const freshnessReason = checkEndTimeFreshness(market)
  if (freshnessReason) return `Instant reject — ${freshnessReason}`

  const text = `${market.title} ${market.resolution_criteria}`
  for (const { pattern, label } of INSTANT_REJECT_PATTERNS) {
    if (pattern.test(text)) {
      return `Instant reject — ${label} (pattern: ${pattern.source.slice(0, 60)})`
    }
  }
  return null
}

function buildZeroScores(): MarketScores {
  return {
    emotional_relevance: 1,
    clarity: 5,
    debate_potential: 3,
    time_tension: 5,
    social_discussability: 2,
    weighted_score: 0,
  }
}

// ── AI Scoring ────────────────────────────────────────────────────────────────

async function batchScoreWithClaude(
  markets: GeneratedMarket[],
  apiKey: string
): Promise<Array<Record<string, number>>> {
  const client = new Anthropic({ apiKey })

  const prompt = `You are the quality gatekeeper for Ledge, a Gen Z social betting app.
Your job: score prediction markets so only the most emotionally engaging ones reach users.

TARGET AUDIENCE: Ages 16–26. Deeply online. They live for: sports drama, celebrity beef,
viral moments, gaming, TV/streaming, music drops, relationship gossip, memes, and anything
that causes Twitter/TikTok discourse. They actively DISLIKE: corporate news, financial jargon,
obscure political procedure, and anything that sounds like homework.

THE GOAL: Surface markets that feel like something you'd text your friends about.
"Bro are you betting YES or NO on this?" — that's the target emotional response.

Score each market on 5 dimensions from 1 to 10:

emotional_relevance (0.30 weight)
  10 = They'd stay up to find out the result (favorite team game, celeb drama)
  7  = Casually interested
  4  = Aware it exists but doesn't personally touch them
  1  = Would never hear about this if Ledge didn't show them

clarity (0.25 weight)
  10 = Anyone reads it once and knows exactly what YES vs NO means
  7  = Clear after one second of thought
  4  = Needs a moment / some context
  1  = Confusing, requires background knowledge to understand

debate_potential (0.20 weight)
  10 = 50/50 split, everyone has a strong take (Lakers vs Celtics)
  7  = Genuine uncertainty, people disagree
  4  = Obvious lean one way, not much to argue
  1  = Essentially already decided or nobody cares either way

time_tension (0.15 weight)
  10 = Resolves tonight / tomorrow — maximum adrenaline
  7  = 2–4 days, stays interesting
  4  = 5–7 days, attention drifts
  1  = Weeks away, might as well be never

social_discussability (0.10 weight)
  10 = Guaranteed group chat debate, Twitter argument, or TikTok video
  7  = Friends would naturally bring it up
  4  = Maybe mentioned once
  1  = Nobody would ever voluntarily bring this up

Markets to score:
${markets.map((m, i) => `${i + 1}. [${m.category}] "${m.title}" — resolves ${new Date(m.end_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`).join('\n')}

SCORING GUIDE:
- Sports game winner (tonight): ER=9, CL=10, DP=8, TT=10, SD=9 → excellent
- Celebrity breakup rumor: ER=8, CL=9, DP=7, TT=7, SD=10 → excellent
- Viral gaming event: ER=7, CL=8, DP=6, TT=8, SD=8 → good
- Generic political bill: ER=4, CL=4, DP=5, TT=5, SD=3 → weak
- Corporate earnings beat: ER=2, CL=6, DP=5, TT=6, SD=2 → reject

Be HARSH. A 6+ weighted score means "worth a user's bet." Grade on that standard.

Return ONLY a JSON array with one object per market, same order, no other text:
[{"emotional_relevance":8,"clarity":9,"debate_potential":7,"time_tension":9,"social_discussability":8}]`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error(`Market scorer returned no JSON array. Raw: ${text.slice(0, 300)}`)
  }

  const raw = JSON.parse(jsonMatch[0]) as Array<Record<string, number>>
  return raw
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a batch of generated markets and split them into accepted / rejected.
 *
 * @param markets  - Raw markets from the AI generator
 * @param apiKey   - Anthropic API key (falls back to process.env.ANTHROPIC_API_KEY)
 * @returns        ScoringResult with accepted ScoredMarkets, rejected markets, and stats
 */
export async function scoreMarkets(
  markets: GeneratedMarket[],
  apiKey?: string
): Promise<ScoringResult> {
  const accepted: ScoredMarket[] = []
  const rejected: RejectedMarket[] = []

  // ── Phase 1: Instant pattern-based pre-filter ──────────────────────────────

  const toAiScore: GeneratedMarket[] = []

  for (const market of markets) {
    const rejectReason = checkInstantReject(market)
    if (rejectReason) {
      rejected.push({
        market,
        scores: { ...buildZeroScores(), weighted_score: 0 },
        reason: rejectReason,
      })
    } else {
      toAiScore.push(market)
    }
  }

  const instantRejected = rejected.length

  if (toAiScore.length === 0) {
    return {
      accepted,
      rejected,
      scoring_stats: {
        total_input: markets.length,
        instant_rejected: instantRejected,
        ai_scored: 0,
        ai_accepted: 0,
        ai_rejected: 0,
        avg_accepted_score: 0,
      },
    }
  }

  // ── Phase 2: AI batch scoring ──────────────────────────────────────────────

  const key = apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set — cannot score markets')

  let rawScores: Array<Record<string, number>> = []
  try {
    rawScores = await batchScoreWithClaude(toAiScore, key) as Array<Record<string, number>>
  } catch (err) {
    // If scoring fails entirely, log but don't block generation — fall through
    // with all markets accepted at a default score of 50 (neutral quality).
    console.error('[market-scorer] AI scoring failed, accepting all with score 50:', err)
    return {
      accepted: toAiScore.map((m) => ({ ...m, quality_score: 50 })),
      rejected,
      scoring_stats: {
        total_input: markets.length,
        instant_rejected: instantRejected,
        ai_scored: toAiScore.length,
        ai_accepted: toAiScore.length,
        ai_rejected: 0,
        avg_accepted_score: 50,
      },
    }
  }

  // ── Phase 3: Classify based on weighted threshold ─────────────────────────

  for (let i = 0; i < toAiScore.length; i++) {
    const market = toAiScore[i]
    const raw = rawScores[i]

    if (!raw) {
      rejected.push({
        market,
        scores: { ...buildZeroScores(), weighted_score: 0 },
        reason: 'Scorer returned no score entry for this market index',
      })
      continue
    }

    const scores: Omit<MarketScores, 'weighted_score'> = {
      emotional_relevance:   clamp(raw.emotional_relevance ?? 5),
      clarity:               clamp(raw.clarity ?? 5),
      debate_potential:      clamp(raw.debate_potential ?? 5),
      time_tension:          clamp(raw.time_tension ?? 5),
      social_discussability: clamp(raw.social_discussability ?? 5),
    }

    const weighted_score = computeWeightedScore(scores)
    const fullScores: MarketScores = { ...scores, weighted_score }

    if (weighted_score >= REJECTION_THRESHOLD) {
      accepted.push({
        ...market,
        quality_score: Math.round(weighted_score * 10), // 60–100 range
      })
    } else {
      const weakDimensions = (Object.keys(scores) as Array<keyof typeof scores>)
        .filter((k) => scores[k] < 6)
        .map((k) => `${k.replace(/_/g, ' ')} (${scores[k]})`)

      rejected.push({
        market,
        scores: fullScores,
        reason: `Score ${weighted_score.toFixed(1)}/10 below threshold ${REJECTION_THRESHOLD}${weakDimensions.length ? ` — weak: ${weakDimensions.join(', ')}` : ''}`,
      })
    }
  }

  const aiAccepted = accepted.length
  const aiRejected = toAiScore.length - aiAccepted
  const avgScore =
    accepted.length > 0
      ? accepted.reduce((sum, m) => sum + m.quality_score, 0) / accepted.length
      : 0

  return {
    accepted,
    rejected,
    scoring_stats: {
      total_input: markets.length,
      instant_rejected: instantRejected,
      ai_scored: toAiScore.length,
      ai_accepted: aiAccepted,
      ai_rejected: aiRejected,
      avg_accepted_score: Math.round(avgScore),
    },
  }
}

/**
 * Format a scoring result as a human-readable log string.
 * Use this in server-side cron logs for debugging.
 */
export function formatScoringLog(result: ScoringResult): string {
  const { accepted, rejected, scoring_stats: s } = result
  const lines: string[] = [
    `[market-scorer] ${s.total_input} generated → ${s.instant_rejected} instant-rejected → ${s.ai_scored} AI-scored → ${s.ai_accepted} accepted / ${s.ai_rejected} AI-rejected`,
    `[market-scorer] avg accepted quality score: ${s.avg_accepted_score}/100`,
  ]

  if (accepted.length > 0) {
    lines.push('[market-scorer] ACCEPTED:')
    for (const m of accepted) {
      lines.push(`  ✅ [${m.quality_score}/100] ${m.category} — "${m.title}"`)
    }
  }

  if (rejected.length > 0) {
    lines.push('[market-scorer] REJECTED:')
    for (const { market, scores, reason } of rejected) {
      const scoreStr = scores.weighted_score > 0
        ? ` (ER=${scores.emotional_relevance} CL=${scores.clarity} DP=${scores.debate_potential} TT=${scores.time_tension} SD=${scores.social_discussability} → ${scores.weighted_score.toFixed(1)}/10)`
        : ''
      lines.push(`  ❌ ${market.category} — "${market.title}"`)
      lines.push(`     ${reason}${scoreStr}`)
    }
  }

  return lines.join('\n')
}
