/**
 * Live/in-play timing helpers.
 *
 * A market is "live" (event happening now) when its close time is within the
 * LIVE_WINDOW_HOURS. Sports markets close at game_time + 3h, so ≤ 4h remaining
 * reliably means the game is either in progress or just finishing.
 *
 * "Closing soon" covers the broader window up to 24h (today / tonight).
 */

export const LIVE_WINDOW_HOURS   = 4   // ≤ 4h left → event happening now
export const CLOSING_SOON_HOURS  = 24  // ≤ 24h left → tonight / today

/** True when the event is likely in-progress right now. */
export function isLive(endTime: Date | string): boolean {
  const ms = typeof endTime === 'string' ? Date.parse(endTime) : endTime.getTime()
  const hoursLeft = (ms - Date.now()) / 3_600_000
  return hoursLeft > 0 && hoursLeft <= LIVE_WINDOW_HOURS
}

/** True when the market closes today / tonight but isn't live yet. */
export function isClosingSoon(endTime: Date | string): boolean {
  const ms = typeof endTime === 'string' ? Date.parse(endTime) : endTime.getTime()
  const hoursLeft = (ms - Date.now()) / 3_600_000
  return hoursLeft > LIVE_WINDOW_HOURS && hoursLeft <= CLOSING_SOON_HOURS
}

/** Hours left until close, rounded to one decimal. Returns 0 if already closed. */
export function hoursLeft(endTime: Date | string): number {
  const ms = typeof endTime === 'string' ? Date.parse(endTime) : endTime.getTime()
  return Math.max(0, (ms - Date.now()) / 3_600_000)
}

/** Short human-readable label: "2h 14m" or "47m" */
export function formatTimeLeft(endTime: Date | string): string {
  const ms = typeof endTime === 'string' ? Date.parse(endTime) : endTime.getTime()
  const totalMins = Math.max(0, Math.floor((ms - Date.now()) / 60_000))
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return 'now'
}
