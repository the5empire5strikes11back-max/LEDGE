/**
 * ESPN game verification — hard, real-data freshness check for sports markets.
 *
 * The temporal validator (lib/market-validation.ts) trusts the model's claimed
 * event status. For sports, we can do better: ESPN's public scoreboard tells us
 * whether a team's game is actually SCHEDULED (pre/in) or already FINAL (post).
 * This is the only path that *verifies* an event is upcoming against live data
 * rather than trusting the LLM — satisfying "do not assume upcoming unless
 * verified."
 *
 * Policy:
 *   - game found, not final  → VERIFIED, re-anchor close to the real game time
 *   - game found, already final → REJECT (event already happened)
 *   - no game for that team in the window → REJECT (can't confirm — don't guess)
 *   - ESPN unreachable/error  → FAIL OPEN (our outage isn't the market's fault;
 *                               the resolver also uses ESPN downstream)
 */

import type { GeneratedMarket } from '@/lib/market-generator'

export interface EspnVerification {
  market: GeneratedMarket
  verified: boolean
  /** Real game start time (ISO) when a scheduled game was found. */
  eventDateIso?: string
  /** Reason when not verified. */
  reason?: string
}

interface Game {
  date: string
  /** 'pre' (scheduled) | 'in' (live) | 'post' (final) */
  state: string
  completed: boolean
}

function yyyymmdd(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

function parseEspnTeam(targetDataKey: string): string | null {
  try {
    const k = JSON.parse(targetDataKey)
    if (k?.type === 'espn_game' && typeof k.team === 'string' && k.team.trim()) {
      return k.team.trim().toUpperCase()
    }
  } catch {
    /* not JSON / not an espn key */
  }
  return null
}

interface EspnScoreboard {
  events?: Array<{
    date: string
    status?: { type?: { state?: string; completed?: boolean } }
    competitions?: Array<{ competitors?: Array<{ team?: { abbreviation?: string } }> }>
  }>
}

/** Fetch one scoreboard URL and index it as team → best (preferably upcoming) game. */
async function fetchScoreboard(url: string): Promise<Map<string, Game> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Ledge/1.0 (market verification)' },
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as EspnScoreboard

    const byTeam = new Map<string, Game>()
    for (const ev of data.events ?? []) {
      const state = ev.status?.type?.state ?? 'pre'
      const completed = ev.status?.type?.completed ?? false
      const game: Game = { date: ev.date, state, completed }
      const teams = (ev.competitions?.[0]?.competitors ?? [])
        .map((c) => c.team?.abbreviation?.toUpperCase())
        .filter((t): t is string => !!t)

      for (const team of teams) {
        const existing = byTeam.get(team)
        if (!existing) {
          byTeam.set(team, game)
          continue
        }
        const existingUpcoming = !existing.completed && existing.state !== 'post'
        const gameUpcoming = !completed && state !== 'post'
        // Prefer an upcoming game; among upcoming, prefer the soonest.
        if (gameUpcoming && !existingUpcoming) {
          byTeam.set(team, game)
        } else if (gameUpcoming && existingUpcoming && Date.parse(ev.date) < Date.parse(existing.date)) {
          byTeam.set(team, game)
        }
      }
    }
    return byTeam
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * Verify the ESPN-backed sports markets in a batch.
 * Non-ESPN markets pass through untouched (verification is N/A for them).
 * Fetches each unique scoreboard once, in parallel.
 */
export async function verifySportsMarkets(
  markets: GeneratedMarket[],
  nowMs: number = Date.now(),
): Promise<EspnVerification[]> {
  // Pair each market with its ESPN team + date-ranged scoreboard URL (if any).
  const targets = markets.map((m) => {
    const team = parseEspnTeam(m.target_data_key)
    if (!team || !m.resolution_source_url.includes('scoreboard')) {
      return { market: m, team: null as string | null, url: '' }
    }
    const start = yyyymmdd(nowMs)
    const end = yyyymmdd(Math.max(nowMs, Date.parse(m.end_time)) + 86_400_000) // +1 day buffer
    return { market: m, team, url: `${m.resolution_source_url}?dates=${start}-${end}` }
  })

  // Fetch every distinct scoreboard URL once, concurrently.
  const uniqueUrls = [...new Set(targets.map((t) => t.url).filter(Boolean))]
  const boards = new Map<string, Map<string, Game> | null>()
  await Promise.all(
    uniqueUrls.map(async (url) => {
      boards.set(url, await fetchScoreboard(url))
    }),
  )

  return targets.map(({ market, team, url }): EspnVerification => {
    if (!team) return { market, verified: true } // not an ESPN game market — N/A
    const board = boards.get(url)
    if (board == null) return { market, verified: true, reason: 'ESPN unreachable — fail open' }

    const game = board.get(team)
    if (!game) return { market, verified: false, reason: `no scheduled ${team} game in window` }
    if (game.completed || game.state === 'post') {
      return { market, verified: false, reason: `${team} game already final` }
    }
    return { market, verified: true, eventDateIso: game.date }
  })
}
