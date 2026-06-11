/**
 * ESPN schedule seeding — build guaranteed-resolvable sports markets from REAL
 * upcoming games.
 *
 * Instead of asking the model to guess which teams play tonight (most guesses
 * have no scheduled game and get dropped), we pull ESPN's scoreboard for the
 * active leagues, take the genuinely-upcoming games, and turn each into a clean
 * "Will the {home} beat the {away}?" market with a valid espn_game target. These
 * resolve cleanly off the box score — the resolvable backbone of the feed.
 */

import type { GeneratedMarket } from '@/lib/market-generator'
import { MARKET_DURATION } from '@/lib/market-validation'

/** Leagues to scan. Off-season leagues simply return no games (fail-open). */
const ESPN_LEAGUES: Array<{ path: string; label: string }> = [
  { path: 'basketball/nba',     label: 'NBA' },
  { path: 'baseball/mlb',       label: 'MLB' },
  { path: 'hockey/nhl',         label: 'NHL' },
  { path: 'football/nfl',       label: 'NFL' },
  { path: 'soccer/eng.1',       label: 'Premier League' },
  { path: 'soccer/usa.1',       label: 'MLS' },
  { path: 'soccer/fifa.world',  label: 'World Cup' },
]

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
/** A game typically finishes within ~3.5h of tip/first pitch. */
const GAME_DURATION_HOURS = 3.5

interface Competitor {
  homeAway?: string
  team?: { abbreviation?: string; displayName?: string; shortDisplayName?: string }
}
interface EspnEvent {
  date: string
  status?: { type?: { state?: string; completed?: boolean } }
  competitions?: Array<{ competitors?: Competitor[] }>
}
interface EspnScoreboard { events?: EspnEvent[] }

function yyyymmdd(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

async function fetchJson(url: string): Promise<EspnScoreboard | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Ledge/1.0 (schedule seeding)' },
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return (await res.json()) as EspnScoreboard
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * Pull upcoming games across the active leagues and build resolvable markets.
 * @param limit  max markets to return (cap to the Sports deficit).
 * @param nowMs  injectable clock.
 */
export async function fetchUpcomingEspnMarkets(
  limit: number,
  nowMs: number = Date.now(),
): Promise<GeneratedMarket[]> {
  if (limit <= 0) return []

  const start = yyyymmdd(nowMs)
  const end = yyyymmdd(nowMs + 6 * DAY_MS) // scan the next ~6 days
  const markets: GeneratedMarket[] = []

  const boards = await Promise.all(
    ESPN_LEAGUES.map(async (lg) => {
      const base = `https://site.api.espn.com/apis/site/v2/sports/${lg.path}/scoreboard`
      const data = await fetchJson(`${base}?dates=${start}-${end}`)
      return { lg, base, data }
    }),
  )

  for (const { lg, base, data } of boards) {
    if (!data?.events) continue
    for (const ev of data.events) {
      const state = ev.status?.type?.state ?? 'pre'
      const completed = ev.status?.type?.completed ?? false
      if (completed || state === 'post') continue // already final — skip

      const startMs = Date.parse(ev.date)
      if (Number.isNaN(startMs)) continue
      const hoursToGame = (startMs - nowMs) / HOUR_MS
      // Must be in the future and inside our market-duration window.
      const closeMs = startMs + GAME_DURATION_HOURS * HOUR_MS
      const hoursToClose = (closeMs - nowMs) / HOUR_MS
      if (hoursToGame < 0.5 || hoursToClose > MARKET_DURATION.MAX_HOURS) continue

      const comps = ev.competitions?.[0]?.competitors ?? []
      const home = comps.find((c) => c.homeAway === 'home') ?? comps[0]
      const away = comps.find((c) => c.homeAway === 'away') ?? comps[1]
      const homeAbbr = home?.team?.abbreviation?.toUpperCase()
      const homeName = home?.team?.shortDisplayName || home?.team?.displayName
      const awayName = away?.team?.shortDisplayName || away?.team?.displayName
      if (!homeAbbr || !homeName || !awayName) continue

      markets.push({
        title: `Will the ${homeName} beat the ${awayName}?`,
        category: 'Sports',
        end_time: new Date(closeMs).toISOString(),
        jackpot_pool: 50_000,
        // Slight home-court edge; stays debatable.
        starter_probability: 55,
        resolution_criteria: `Resolves YES if the ${homeName} win this ${lg.label} game per the official ESPN box score.`,
        resolution_source_url: base,
        target_data_key: JSON.stringify({ type: 'espn_game', team: homeAbbr, condition: 'win' }),
      })
      if (markets.length >= limit) return markets
    }
  }

  return markets
}
