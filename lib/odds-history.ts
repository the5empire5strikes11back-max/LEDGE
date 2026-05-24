/**
 * Client-side odds history tracking.
 *
 * Maintains a lightweight in-memory ring buffer of yes_percent snapshots per
 * market. No database writes — history is built from the Supabase Realtime
 * stream and seeded on initial page load. Cleared on refresh.
 *
 * Design decisions:
 *   - Stored in a React ref (Map), not state — no re-renders on push
 *   - Max 20 points per market — stays tiny in memory
 *   - Deduplication: consecutive identical values are collapsed
 *   - All signal computation is pure and cheap (O(n), n ≤ 20)
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OddsPoint {
  ts: number   // Unix timestamp ms
  pct: number  // yes_percent (0–100)
}

export type VolatilityState = 'calm' | 'moving' | 'volatile' | 'surging'

export interface MovementSignals {
  trend: 'up' | 'down' | 'flat'
  delta5m: number | null
  delta15m: number | null
  delta1h: number | null
  volatility: VolatilityState
  label: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max snapshots retained per market. Older ones are dropped from the front. */
const MAX_POINTS = 20

/** Minimum pp movement to qualify as "significant" for trend detection. */
const TREND_THRESHOLD_PP = 2

// ── Ring buffer ───────────────────────────────────────────────────────────────

/**
 * Push a new yes_percent snapshot into the ring for a market.
 * - Creates the ring if it doesn't exist yet.
 * - Skips if the value is identical to the last recorded point.
 * - Trims to MAX_POINTS from the front.
 * Returns the updated array (same reference — mutates in place).
 */
export function pushOddsPoint(
  historyMap: Map<string, OddsPoint[]>,
  marketId: string,
  yesPercent: number,
  ts: number = Date.now()
): OddsPoint[] {
  let ring = historyMap.get(marketId)
  if (!ring) {
    ring = []
    historyMap.set(marketId, ring)
  }

  const last = ring[ring.length - 1]
  if (last && last.pct === yesPercent) {
    // Same value — just advance the timestamp so time windows stay accurate
    last.ts = ts
    return ring
  }

  ring.push({ ts, pct: yesPercent })
  if (ring.length > MAX_POINTS) ring.splice(0, ring.length - MAX_POINTS)
  return ring
}

/**
 * Seed initial history from the markets API response.
 * Called once on page load. Only sets the seed point if the market
 * has no history yet (idempotent).
 */
export function seedOddsHistory(
  historyMap: Map<string, OddsPoint[]>,
  markets: Array<{ id: string; yesPercent: number }>,
  nowMs = Date.now()
): void {
  for (const m of markets) {
    if (!historyMap.has(m.id)) {
      historyMap.set(m.id, [{ ts: nowMs, pct: m.yesPercent }])
    }
  }
}

// ── Signal computation ────────────────────────────────────────────────────────

function deltaInWindow(
  ring: OddsPoint[],
  windowMs: number,
  nowMs: number
): number | null {
  const cutoff = nowMs - windowMs
  const inWindow = ring.filter((p) => p.ts >= cutoff)
  if (inWindow.length < 2) return null
  return inWindow[inWindow.length - 1].pct - inWindow[0].pct
}

/**
 * Compute movement signals from a market's history ring.
 * Safe to call with 0 or 1 points — returns calm/flat in that case.
 */
export function computeMovementSignals(
  ring: OddsPoint[],
  nowMs = Date.now()
): MovementSignals {
  if (ring.length < 2) {
    return { trend: 'flat', delta5m: null, delta15m: null, delta1h: null, volatility: 'calm', label: null }
  }

  const delta5m  = deltaInWindow(ring, 5  * 60_000, nowMs)
  const delta15m = deltaInWindow(ring, 15 * 60_000, nowMs)
  const delta1h  = deltaInWindow(ring, 60 * 60_000, nowMs)

  // Overall trend across the full in-memory window
  const totalDelta = ring[ring.length - 1].pct - ring[0].pct
  const trend: MovementSignals['trend'] =
    totalDelta >  TREND_THRESHOLD_PP ? 'up'   :
    totalDelta < -TREND_THRESHOLD_PP ? 'down' : 'flat'

  // Volatility: weight shorter windows more heavily (recent = more relevant)
  const heatScore =
    Math.abs(delta5m  ?? 0) * 1.0 +
    Math.abs(delta15m ?? 0) * 0.5 +
    Math.abs(delta1h  ?? 0) * 0.2

  const volatility: VolatilityState =
    heatScore >= 14 ? 'surging'  :
    heatScore >= 6  ? 'volatile' :
    heatScore >= 2  ? 'moving'   : 'calm'

  // Build the most specific, most recent label possible
  let label: string | null = null

  if (delta5m !== null && Math.abs(delta5m) >= 4) {
    const dir = delta5m > 0 ? 'YES' : 'NO'
    label = `${dir} +${Math.abs(delta5m).toFixed(0)}% in 5m`
  } else if (volatility === 'surging') {
    label = 'Momentum accelerating'
  } else if (volatility === 'volatile') {
    label = 'Heavy movement'
  } else if (delta15m !== null && Math.abs(delta15m) >= 4) {
    const dir = delta15m > 0 ? 'YES' : 'NO'
    label = `${dir} +${Math.abs(delta15m).toFixed(0)}% in 15m`
  } else if (volatility === 'moving') {
    label = 'Volatile'
  } else if (delta1h !== null && Math.abs(delta1h) >= 5) {
    const dir = delta1h > 0 ? 'YES' : 'NO'
    label = `${dir} +${Math.abs(delta1h).toFixed(0)}% in 1h`
  }

  return { trend, delta5m, delta15m, delta1h, volatility, label }
}
