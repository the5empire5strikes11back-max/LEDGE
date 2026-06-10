/**
 * Circle market access control.
 *
 * Circle markets (rows where `circle_id` is non-null) are PRIVATE — they may
 * only be seen and acted on by members of that circle. Public/AI markets have
 * a null `circle_id` and are visible to everyone.
 *
 * This module centralizes the membership rule so every read/write path applies
 * it identically. Never inline an ad-hoc circle check — use these helpers so the
 * privacy guarantee can't drift between routes.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

/** Fetch the set of circle IDs the given user belongs to. */
export async function getUserCircleIds(
  supabase: SupabaseLike,
  userId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('user_id', userId)
  return new Set(
    (data ?? []).map((row: { circle_id: string }) => row.circle_id)
  )
}

/**
 * Whether a user may access a market given its circle_id.
 * Public markets (null circle_id) are always accessible. Circle markets are
 * accessible only to members of that circle.
 */
export function canAccessCircleMarket(
  circleId: string | null | undefined,
  userCircleIds: Set<string>
): boolean {
  if (!circleId) return true
  return userCircleIds.has(circleId)
}

/**
 * Filter a list of markets down to those the user is allowed to see.
 * Drops circle markets the user is not a member of; keeps all public markets.
 */
export function filterVisibleMarkets<T extends { circle_id?: string | null }>(
  markets: T[],
  userCircleIds: Set<string>
): T[] {
  return markets.filter((m) => canAccessCircleMarket(m.circle_id, userCircleIds))
}
