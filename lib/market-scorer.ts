/**
 * Market Quality Scoring System
 *
 * Runs between AI market generation and database insertion.
 * Two-phase pipeline:
 *   Phase 1 — Instant pattern pre-filter: rejects obviously bad markets with zero AI cost.
 *   Phase 2 — Claude Haiku batch scoring: scores remaining candidates on 5 dimensions.
 *
 * Only markets with a weighted score >= REJECTION_THRESHOLD are accepted.
 * Rejected markets are returned with their scores and reasons for debugging.
 *
 * Design principles:
 *   - Be harsh. A 6.5+ score means genuinely worth a Gen Z user's bet.
 *   - Emotional relevance is king — it gets the highest weight.
 *   - Corporate/financial/geopolitical content is killed before AI costs are incurred.
 *   - Sports, celebrity drama, gaming, viral culture are the goal.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { GeneratedMarket } from './market-generator'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketScores {
  emotional_relevance:   number   // 1–10: Does Gen Z emotionally care about this?
  clarity:               number   // 1–10: Understood instantly, under 3 seconds?
  debate_potential:      number   // 1–10: Can reasonable people genuinely disagree?
  time_tension:          number   // 1–10: Resolves soon enough to keep excitement?
  social_discussability: number   // 1–10: Would friends naturally talk/argue about it?
  weighted_score:        number   // Computed weighted average (1–10)
}

export interface ScoredMarket extends GeneratedMarket {
  quality_score: number  // 1–100, stored in the DB (weighted_score × 10)
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
    total_input:        number
    instant_rejected:   number
    ai_scored:          number
    ai_accepted:        number
    ai_rejected:        number
    avg_accepted_score: number
  }
}

// ── Weights ───────────────────────────────────────────────────────────────────
//
// Emotional relevance leads — it's the primary engagement signal.
// Social discussability gets more weight than time tension because a market
// people argue about in the group chat is more valuable than one that just
// resolves fast with no discourse.

const SCORE_WEIGHTS = {
  emotional_relevance:   0.35,
  clarity:               0.20,
  debate_potential:      0.18,
  time_tension:          0.12,
  social_discussability: 0.15,
} as const

/**
 * Markets with a weighted score below this threshold are rejected.
 * 6.5/10 = "genuinely engaging and clear." Tight on purpose.
 */
const REJECTION_THRESHOLD = 6.5

/** Minimum hours a market must have remaining to be accepted. */
const MIN_HOURS_REMAINING = 2
/** Maximum hours until close (7 days). Beyond this, attention completely drifts. */
const MAX_HOURS_REMAINING = 168

// ── Instant Reject Patterns ───────────────────────────────────────────────────
//
// Kill bad markets BEFORE spending an AI call. Group them into clear categories.
// Each pattern must be specific enough to avoid false positives.

const INSTANT_REJECT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // ── Financial / Corporate ──────────────────────────────────────────────────
  {
    pattern: /\b(GDP|CPI|inflation rate|basis points|treasury yield|earnings per share|EBITDA|fiscal deficit|balance sheet|net income)\b/i,
    label: 'corporate finance jargon',
  },
  {
    pattern: /\b(q[1-4] earnings|quarterly (revenue|profit|results)|profit guidance|operating margin|market cap|stock buyback)\b/i,
    label: 'quarterly earnings terminology',
  },
  {
    pattern: /\b(index fund|ETF|bond yield|futures contract|options contract|dividend yield|short (selling|squeeze))\b/i,
    label: 'financial instruments',
  },
  {
    pattern: /\b(central bank|interest rate (hike|cut|decision)|monetary policy|FOMC meeting|Federal Reserve|Fed Reserve|repo rate|prime rate)\b/i,
    label: 'central banking / monetary policy',
  },
  {
    pattern: /\b(trade (deficit|surplus|balance)|tariff (policy|increase|cut)|import (duty|tariff)|export ban)\b/i,
    label: 'trade policy / tariffs',
  },
  {
    pattern: /\b(semiconductor|chip (shortage|supply)|supply chain|logistics|shipping container|freight rate)\b/i,
    label: 'supply chain / industrial',
  },

  // ── Obscure Legislative / Legal Procedure ──────────────────────────────────
  {
    pattern: /\b(cloture|filibuster|quorum|parliamentary procedure|appropriations bill|reconciliation bill|continuing resolution)\b/i,
    label: 'obscure legislative procedure',
  },
  {
    pattern: /\b(SCOTUS|Supreme Court ruling|appellate (court|decision)|injunction|restraining order|subpoena|amicus)\b/i,
    label: 'legal/court procedure',
  },
  {
    pattern: /\b(debt ceiling|budget resolution|omnibus (bill|package)|stopgap (measure|funding))\b/i,
    label: 'budget/debt procedure',
  },

  // ── Geopolitical Jargon ───────────────────────────────────────────────────
  {
    pattern: /\b(ceasefire|cease-fire|peace (talks|deal|accord|negotiations)|bilateral (agreement|talks|summit)|multilateral)\b/i,
    label: 'geopolitical peace process jargon',
  },
  {
    pattern: /\b(sanctions (regime|package|relief)|diplomatic (relations|ties|channel)|ambassador|envoy)\b/i,
    label: 'diplomatic/sanctions jargon',
  },
  {
    pattern: /\b(UN (Security Council|resolution|vote)|NATO (summit|meeting|allies)|G7|G20)\b/i,
    label: 'international institution jargon',
  },

  // ── Already-Resolved / Past Events ────────────────────────────────────────
  {
    // Past-year championship or award (e.g. "2024 NBA Champion", "last season's MVP")
    pattern: /\b(20(1[0-9]|2[0-5])\s+(champion|championship|winner|award|season|cup|title|mvp|playoff)|(last|previous)\s+(season|year|month|week)'?s?\b)/i,
    label: 'past-year or previous-season event',
  },
  {
    // Rhetorical / already-answered questions
    pattern: /^(did |has |who won |who is the (new|current|next) )/i,
    label: 'past-resolved or rhetorical question',
  },

  // ── Too Vague / No Clear Resolution ───────────────────────────────────────
  {
    // Markets that can't actually be verified
    pattern: /\b(ever|someday|eventually|in the future|at some point|soon enough)\b/i,
    label: 'vague/unresolvable timeframe',
  },

  // ── Generic / Unnamed Subject (the #1 quality problem) ────────────────────
  {
    // "Will a celebrity / a streamer / a creator ... " — no named subject = unverifiable + boring
    pattern: /\b(a|an|any|some|another)\s+(\w+\s+){0,2}(celebrity|celeb|streamer|creator|influencer|youtuber|tiktoker|gamer|rapper|artist|singer|musician|actor|actress|athlete|player|brand|company|startup|team|show|movie|film|song|album|game)\b/i,
    label: 'generic unnamed subject — name a specific person/team/thing',
  },
  {
    // "a surprise collab / unexpected drop" with nobody named
    pattern: /\b(surprise|unexpected|unannounced|random|secret)\s+(collab|collaboration|drop|release|announcement|appearance|guest|reunion)\b/i,
    label: 'vague "surprise X" with no named subject',
  },
  {
    pattern: /\b(someone|somebody|anyone|anybody|some\s+\w+\s+(star|figure|name))\b/i,
    label: 'unnamed subject (someone/anyone)',
  },

  // ── Extreme Length Guards ─────────────────────────────────────────────────
  // Caught separately in checkInstantReject — see below
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkEndTimeFreshness(market: GeneratedMarket): string | null {
  const endTime = new Date(market.end_time)
  if (isNaN(endTime.getTime())) {
    return `Invalid end_time: "${market.end_time}"`
  }
  const hoursRemaining = (endTime.getTime() - Date.now()) / 3_600_000
  if (hoursRemaining < MIN_HOURS_REMAINING) {
    return `End time too soon — ${hoursRemaining.toFixed(1)}h remaining (min ${MIN_HOURS_REMAINING}h)`
  }
  if (hoursRemaining > MAX_HOURS_REMAINING) {
    return `End time too far — ${(hoursRemaining / 24).toFixed(1)} days away (max ${MAX_HOURS_REMAINING / 24} days)`
  }
  return null
}

function checkInstantReject(market: GeneratedMarket): string | null {
  // 1. End-time freshness
  const freshnessReason = checkEndTimeFreshness(market)
  if (freshnessReason) return `Instant reject — ${freshnessReason}`

  // 2. Title length guards — too short is vague, too long is unreadable
  if (market.title.length < 15) {
    return `Instant reject — title too short (${market.title.length} chars, min 15)`
  }
  if (market.title.length > 110) {
    return `Instant reject — title too long (${market.title.length} chars, max 110) — unreadable on card`
  }

  // 3. Pattern-based content filter
  const text = `${market.title} ${market.resolution_criteria}`
  for (const { pattern, label } of INSTANT_REJECT_PATTERNS) {
    if (pattern.test(text)) {
      return `Instant reject — ${label}`
    }
  }

  return null
}

function computeWeightedScore(scores: Omit<MarketScores, 'weighted_score'>): number {
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

function buildZeroScores(): MarketScores {
  return {
    emotional_relevance: 1, clarity: 5, debate_potential: 3,
    time_tension: 5, social_discussability: 2, weighted_score: 0,
  }
}

// ── AI Scoring ────────────────────────────────────────────────────────────────

async function batchScoreWithClaude(
  markets: GeneratedMarket[],
  apiKey: string
): Promise<Array<Record<string, number>>> {
  const client = new Anthropic({ apiKey })

  const prompt = `You are the quality gatekeeper for Ledge — a Gen Z social betting app.
Your job: score prediction markets so only the most emotionally engaging ones reach users.

TARGET AUDIENCE: Ages 16–26. Deeply online. They live for: sports drama, celebrity beef,
viral TikTok moments, gaming releases, TV/streaming events, music drops, award show chaos,
relationship gossip, anything that causes Twitter/X or group chat discourse.
They actively HATE: corporate news, financial jargon, obscure political procedure, anything
that sounds like a homework assignment or LinkedIn post.

THE TEST: Read each market and ask — "Would someone text this to their group chat?"
If yes, it scores high. If it feels like a news ticker from CNBC, it scores low.

Score each market on 5 dimensions from 1–10:

emotional_relevance (35% of final score)
  10 = They'd stay up past midnight to see the result (rival team game, celeb drama)
  8  = Genuinely excited to know the outcome
  6  = Mildly interested — aware it exists
  4  = Only cares if they follow this topic closely
  2  = Would never hear about this unprompted
  1  = Completely indifferent (think: central bank interest rate decision)

clarity (20% of final score)
  10 = Anyone reads it once and instantly knows what YES vs NO means
  8  = Clear after one second — no ambiguity
  6  = Needs a moment / light context
  4  = Requires background knowledge
  1  = Confusing even with context

debate_potential (18% of final score)
  10 = Even 50/50 split, everyone has a hot take (classic rivalry game)
  8  = Real uncertainty + people disagree
  6  = Some disagreement, leans one way
  4  = Obvious answer, little to argue
  1  = Nobody genuinely debates this

time_tension (12% of final score)
  10 = Resolves tonight or tomorrow — maximum adrenaline
  8  = 2–3 days, stays exciting
  6  = 4–5 days, some drift
  4  = 6–7 days, losing steam
  1  = More than a week away — basically never

social_discussability (15% of final score)
  10 = Guaranteed to blow up in group chats, create TikToks, spark arguments
  8  = Friends would naturally bring it up without prompting
  6  = Mentioned if the topic comes up
  4  = Discussed only by people deeply into this niche
  1  = Nobody would ever voluntarily bring this up

Markets to score:
${markets.map((m, i) => `${i + 1}. [${m.category}] "${m.title}" — closes ${new Date(m.end_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`).join('\n')}

REFERENCE SCORES — calibrate against these:
Sports game winner (tonight's big match):   ER=9 CL=10 DP=9 TT=10 SD=9  → EXCELLENT
Celebrity drama / beef:                      ER=8 CL=9  DP=7 TT=7  SD=10 → EXCELLENT
Music drop / chart battle:                   ER=7 CL=9  DP=6 TT=8  SD=8  → GOOD
Reality TV elimination:                      ER=7 CL=10 DP=6 TT=7  SD=8  → GOOD
Award show winner (tonight):                 ER=8 CL=10 DP=8 TT=10 SD=9  → EXCELLENT
Generic political bill vote:                 ER=4 CL=4  DP=5 TT=5  SD=3  → WEAK
Corporate earnings miss/beat:               ER=2 CL=6  DP=4 TT=6  SD=2  → REJECT
Obscure international policy question:      ER=2 CL=3  DP=4 TT=5  SD=2  → REJECT

BE HARSH. The acceptance bar is a 6.5+ weighted score. Grade like a gatekeeper whose job
depends on keeping the feed electric. Weak markets waste real users' time.

Return ONLY a JSON array with one object per market, same order as input, no other text:
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

  return JSON.parse(jsonMatch[0]) as Array<Record<string, number>>
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a batch of generated markets and split them into accepted / rejected.
 *
 * Phase 1: Instant pattern-based pre-filter (free — no AI cost).
 * Phase 2: Claude Haiku batch scoring on survivors.
 * Phase 3: Weighted threshold classification.
 *
 * @param markets  - Raw markets from the AI generator
 * @param apiKey   - Anthropic API key (falls back to process.env.ANTHROPIC_API_KEY)
 */
export async function scoreMarkets(
  markets: GeneratedMarket[],
  apiKey?: string
): Promise<ScoringResult> {
  const accepted: ScoredMarket[] = []
  const rejected: RejectedMarket[] = []

  // ── Phase 1: Instant pre-filter ─────────────────────────────────────────────

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
        ai_scored: 0, ai_accepted: 0, ai_rejected: 0,
        avg_accepted_score: 0,
      },
    }
  }

  // ── Phase 2: AI batch scoring ────────────────────────────────────────────────

  const key = apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set — cannot score markets')

  let rawScores: Array<Record<string, number>> = []
  try {
    rawScores = await batchScoreWithClaude(toAiScore, key)
  } catch (err) {
    // If scoring fails, accept all at neutral score 50 so generation isn't blocked.
    console.error('[market-scorer] AI scoring failed — accepting all with score 50:', err)
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

  // ── Phase 3: Classify by weighted threshold ──────────────────────────────────

  for (let i = 0; i < toAiScore.length; i++) {
    const market = toAiScore[i]
    const raw = rawScores[i]

    if (!raw) {
      rejected.push({
        market,
        scores: { ...buildZeroScores(), weighted_score: 0 },
        reason: 'Scorer returned no entry for this market index',
      })
      continue
    }

    const scores: Omit<MarketScores, 'weighted_score'> = {
      emotional_relevance:   clamp(raw.emotional_relevance   ?? 5),
      clarity:               clamp(raw.clarity               ?? 5),
      debate_potential:      clamp(raw.debate_potential      ?? 5),
      time_tension:          clamp(raw.time_tension          ?? 5),
      social_discussability: clamp(raw.social_discussability ?? 5),
    }

    const weighted_score = computeWeightedScore(scores)
    const fullScores: MarketScores = { ...scores, weighted_score }

    if (weighted_score >= REJECTION_THRESHOLD) {
      accepted.push({
        ...market,
        quality_score: Math.round(weighted_score * 10), // 65–100 for accepted markets
      })
    } else {
      const weakDimensions = (Object.keys(scores) as Array<keyof typeof scores>)
        .filter((k) => scores[k] < 6)
        .map((k) => `${k.replace(/_/g, ' ')} (${scores[k]})`)

      rejected.push({
        market,
        scores: fullScores,
        reason: `Score ${weighted_score.toFixed(1)}/10 below threshold ${REJECTION_THRESHOLD}${
          weakDimensions.length ? ` — weak: ${weakDimensions.join(', ')}` : ''
        }`,
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
 * Format a scoring result as a human-readable log string for cron output.
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
      lines.push(`  ✅ [${m.quality_score}/100] ${m.category.padEnd(8)} "${m.title}"`)
    }
  }

  if (rejected.length > 0) {
    lines.push('[market-scorer] REJECTED:')
    for (const { market, scores, reason } of rejected) {
      const scoreStr = scores.weighted_score > 0
        ? ` (ER=${scores.emotional_relevance} CL=${scores.clarity} DP=${scores.debate_potential} TT=${scores.time_tension} SD=${scores.social_discussability} → ${scores.weighted_score.toFixed(1)}/10)`
        : ''
      lines.push(`  ❌ ${market.category.padEnd(8)} "${market.title}"`)
      lines.push(`     ${reason}${scoreStr}`)
    }
  }

  return lines.join('\n')
}
