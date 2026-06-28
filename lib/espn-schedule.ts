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

/** American moneyline → implied win probability (0–1). */
function mlToProb(ml: number): number {
  return ml < 0 ? (-ml) / (-ml + 100) : 100 / (ml + 100)
}

/**
 * Home-team win probability (30–70) from ESPN's pre-game odds.
 *
 * ESPN usually leaves homeTeamOdds.moneyLine null and instead encodes the line
 * in `details` like "PIT -136" (the FAVORED team's abbreviation + its moneyline).
 * We parse that, decide whether the favorite is home or away, and convert. Falls
 * back to the home moneyline field, then to 55 (mild home-field edge) if no odds
 * are posted yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function homeWinProbFromOdds(comp: any, homeAbbr: string): number {
  const clamp = (p: number) => Math.round(Math.max(30, Math.min(70, p)))
  const odds = comp?.odds?.[0]
  if (!odds) return 55

  // 1. details string: "<ABBR> <±moneyline>" — the favorite and its line.
  const details: string = typeof odds.details === 'string' ? odds.details : ''
  const m = details.match(/([A-Z]{2,4})\s*([+-]\d{2,4})/)
  if (m) {
    const favAbbr = m[1].toUpperCase()
    const favProb = mlToProb(parseInt(m[2], 10))
    const homeProb = favAbbr === homeAbbr ? favProb : 1 - favProb
    return clamp(homeProb * 100)
  }

  // 2. Explicit home moneyline, when ESPN populates it.
  const ml = odds.homeTeamOdds?.moneyLine
  if (typeof ml === 'number' && ml !== 0) return clamp(mlToProb(ml) * 100)

  // 3. No usable odds — mild home-field default.
  return 55
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

      const comp = ev.competitions?.[0]
      const comps = comp?.competitors ?? []
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
        // Real home-win probability from ESPN's moneyline odds when available,
        // so each game opens at its true price — not a flat 55%.
        starter_probability: homeWinProbFromOdds(comp, homeAbbr),
        resolution_criteria: `Resolves YES if the ${homeName} win this ${lg.label} game per the official ESPN box score.`,
        resolution_source_url: base,
        target_data_key: JSON.stringify({ type: 'espn_game', team: homeAbbr, condition: 'win' }),
      })
      if (markets.length >= limit) return markets
    }
  }

  return markets
}
