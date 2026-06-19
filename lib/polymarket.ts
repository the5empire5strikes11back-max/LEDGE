/**
 * Polymarket mirror — pulls real, calibrated prices from Polymarket's public
 * Gamma API (free, no key) so Ledge can show real-world odds rather than
 * fake-money guesses. The YES outcome price (0–1) IS the implied probability.
 */

const GAMMA = 'https://gamma-api.polymarket.com'
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export interface PolymarketMirror {
  id: string
  question: string
  /** 0–1 — Polymarket's real implied probability of YES */
  yesPrice: number
  endDate: string
  slug: string
  volume24hr: number
}

// AbortSignal.timeout() throws under Turbopack — use AbortController.
async function getJson(url: string, timeoutMs = 10_000): Promise<unknown> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(t)
    if (!res.ok) return null
    return await res.json()
  } catch {
    clearTimeout(t)
    return null
  }
}

/** Gamma returns outcomes/prices as either arrays or JSON-encoded strings. */
function parseArr(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : null } catch { return null }
  }
  return null
}

/**
 * Top active binary Yes/No markets by 24h volume, filtered to ones worth
 * mirroring: debatable price (8–92%), resolves inside Ledge's 2h–30d window.
 */
export async function fetchTopPolymarketMarkets(limit = 12): Promise<PolymarketMirror[]> {
  const data = await getJson(`${GAMMA}/markets?closed=false&active=true&limit=80&order=volume24hr&ascending=false`)
  if (!Array.isArray(data)) return []

  const nowMs = Date.now()
  const out: PolymarketMirror[] = []
  for (const raw of data as Array<Record<string, unknown>>) {
    const outcomes = parseArr(raw.outcomes)
    const prices = parseArr(raw.outcomePrices)
    if (!outcomes || !prices || outcomes.length !== 2 || prices.length !== 2) continue
    if (String(outcomes[0]).toLowerCase() !== 'yes') continue // binary Yes/No only

    const yesPrice = Number(prices[0])
    if (!(yesPrice > 0.08 && yesPrice < 0.92)) continue // skip near-settled / non-debatable

    const endIso = typeof raw.endDate === 'string' ? raw.endDate : ''
    const end = Date.parse(endIso)
    if (Number.isNaN(end) || end < nowMs + 2 * HOUR_MS || end > nowMs + 30 * DAY_MS) continue

    const q = typeof raw.question === 'string' ? raw.question.trim() : ''
    if (!q || q.length > 180) continue

    out.push({
      id: String(raw.id),
      question: q,
      yesPrice,
      endDate: endIso,
      slug: typeof raw.slug === 'string' ? raw.slug : '',
      volume24hr: Number(raw.volume24hr) || 0,
    })
    if (out.length >= limit) break
  }
  return out
}

/**
 * Resolve a mirrored market by reading Polymarket's settled outcome.
 * A resolved Polymarket market has closed=true and outcomePrices ["1","0"]
 * (YES won) or ["0","1"] (NO won).
 */
export async function resolvePolymarketOutcome(id: string): Promise<'yes' | 'no' | 'unknown'> {
  // The single-market endpoint returns the market object directly and, unlike
  // the list query, includes closed/resolved markets.
  const m = await getJson(`${GAMMA}/markets/${encodeURIComponent(id)}`) as Record<string, unknown> | null
  if (!m || typeof m !== 'object' || m.closed !== true) return 'unknown'
  const prices = parseArr(m.outcomePrices)
  const yesP = prices ? Number(prices[0]) : NaN
  if (yesP >= 0.99) return 'yes'
  if (yesP <= 0.01) return 'no'
  return 'unknown'
}
