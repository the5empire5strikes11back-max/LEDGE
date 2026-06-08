/**
 * Creator Trust System
 *
 * Computes a deterministic [0.1, 0.95] trust score from a creator's
 * market history. No new DB columns required — everything derived from
 * the existing markets table (status, hot_score, total_credits).
 *
 * Score composition:
 *   70%  Approval ratio  — live / (live + review)
 *   30%  Engagement      — avg hot_score on live markets (bets attracted)
 *
 * New creators (no history) start at 0.5 (neutral).
 *
 * Tiers:
 *   trusted    ≥ 0.70 — fast-tracked through review patterns
 *   normal     0.35–0.69 — standard screening
 *   restricted < 0.35 — review patterns escalated to reject
 */

import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreatorTier = 'trusted' | 'normal' | 'restricted'

export interface CreatorTrustResult {
  /** Normalized trust score [0.1, 0.95] */
  score: number
  /** Tier derived from score */
  tier: CreatorTier
  /** Number of live markets this creator has */
  liveCount: number
  /** Number of markets in review state */
  reviewCount: number
  /** Average hot_score across live markets (proxy for engagement) */
  avgHotScore: number
}

// ── Thresholds ────────────────────────────────────────────────────────────────

export const TRUST_THRESHOLDS = {
  trusted:    0.70,
  restricted: 0.35,
} as const

/**
 * Minimum live markets before trust can reach 'trusted' tier.
 * Prevents gaming the system with a single well-received market.
 */
const MIN_MARKETS_FOR_TRUSTED = 3

/**
 * Hot score at which the engagement component saturates to 1.0.
 * 8 bets on a market = strong community engagement.
 */
const ENGAGEMENT_SATURATION = 8

// ── Score computation ─────────────────────────────────────────────────────────

function scoreTier(score: number, liveCount: number): CreatorTier {
  if (score >= TRUST_THRESHOLDS.trusted && liveCount >= MIN_MARKETS_FOR_TRUSTED) {
    return 'trusted'
  }
  if (score < TRUST_THRESHOLDS.restricted) return 'restricted'
  return 'normal'
}

function computeScore(
  liveCount: number,
  reviewCount: number,
  avgHotScore: number
): number {
  const total = liveCount + reviewCount
  if (total === 0) return 0.5 // neutral for new creators

  // Approval ratio: review-state markets count against the creator
  const approvalRatio = liveCount / total

  // Engagement: how often their live markets attract bets
  const engagementScore = Math.min(avgHotScore / ENGAGEMENT_SATURATION, 1)

  const raw = approvalRatio * 0.70 + engagementScore * 0.30

  // Clamp to [0.10, 0.95] — never zero (always some chance), never perfect
  return Math.max(0.10, Math.min(0.95, raw))
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the creator trust score for a given user ID.
 * Makes two cheap queries against the markets table.
 *
 * @param userId  - The creator whose history to inspect
 * @param admin   - Admin client (needed to read across RLS boundaries)
 */
export async function computeCreatorTrust(
  userId: string,
  admin: AdminClient
): Promise<CreatorTrustResult> {
  // Live markets: count + avg hot_score in one query
  const { data: liveMarkets } = await admin
    .from('markets')
    .select('hot_score')
    .eq('created_by', userId)
    .eq('status', 'live')

  // Review markets: count only
  const { count: reviewCount } = await admin
    .from('markets')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .eq('status', 'review')

  const live = liveMarkets ?? []
  const liveCount = live.length
  const reviewCountSafe = reviewCount ?? 0
  const avgHotScore =
    liveCount > 0
      ? live.reduce((sum, m) => sum + (m.hot_score ?? 0), 0) / liveCount
      : 0

  const score = computeScore(liveCount, reviewCountSafe, avgHotScore)
  const tier = scoreTier(score, liveCount)

  return { score, tier, liveCount, reviewCount: reviewCountSafe, avgHotScore }
}

/**
 * Batch-compute trust scores for multiple creators.
 * Used in the feed GET handler to enrich markets without N+1 queries.
 *
 * Returns a Map<creatorId, CreatorTrustResult>.
 */
export async function batchCreatorTrust(
  creatorIds: string[],
  admin: AdminClient
): Promise<Map<string, CreatorTrustResult>> {
  if (creatorIds.length === 0) return new Map()

  // All live + review markets for these creators in two queries
  const [liveResult, reviewResult] = await Promise.all([
    admin
      .from('markets')
      .select('created_by, hot_score')
      .in('created_by', creatorIds)
      .eq('status', 'live'),
    admin
      .from('markets')
      .select('created_by')
      .in('created_by', creatorIds)
      .eq('status', 'review'),
  ])

  // Group live by creator
  const liveByCreator = new Map<string, number[]>()
  for (const m of liveResult.data ?? []) {
    if (!m.created_by) continue
    const arr = liveByCreator.get(m.created_by) ?? []
    arr.push(m.hot_score ?? 0)
    liveByCreator.set(m.created_by, arr)
  }

  // Group review counts by creator
  const reviewByCreator = new Map<string, number>()
  for (const m of reviewResult.data ?? []) {
    if (!m.created_by) continue
    reviewByCreator.set(m.created_by, (reviewByCreator.get(m.created_by) ?? 0) + 1)
  }

  const result = new Map<string, CreatorTrustResult>()
  for (const id of creatorIds) {
    const hotScores = liveByCreator.get(id) ?? []
    const liveCount = hotScores.length
    const reviewCount = reviewByCreator.get(id) ?? 0
    const avgHotScore =
      liveCount > 0 ? hotScores.reduce((s, v) => s + v, 0) / liveCount : 0

    const score = computeScore(liveCount, reviewCount, avgHotScore)
    const tier = scoreTier(score, liveCount)
    result.set(id, { score, tier, liveCount, reviewCount, avgHotScore })
  }

  return result
}
