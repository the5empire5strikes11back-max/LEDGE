/**
 * Deterministic market resolution — direct HTTP first, no AI tokens.
 * Each market stores resolution_source_url + target_data_key (JSON string).
 * Returns 'yes' | 'no' | 'unknown'. Callers should invoke Claude only on 'unknown'.
 */

import { resolvePolymarketOutcome } from '@/lib/polymarket'

const TIMEOUT_MS = 8_000

// ── Target schemas ────────────────────────────────────────────────────────────

interface EspnGameTarget {
  type: 'espn_game'
  /** Team abbreviation, e.g. "LAL", "NE", "CHI" */
  team: string
  condition: 'win' | 'loss'
}

interface RssKeywordTarget {
  type: 'rss_keyword'
  /** Any hit → YES */
  yes_terms: string[]
  /** Any hit → NO */
  no_terms: string[]
}

interface JsonFieldTarget {
  type: 'json_field'
  /** Dot-notation path, e.g. "data.status" */
  path: string
  yes_value: string
}

interface PolymarketTarget {
  type: 'polymarket'
  /** Polymarket Gamma market id — resolution mirrors Polymarket's settled outcome. */
  id: string
}

type ResolutionTarget = EspnGameTarget | RssKeywordTarget | JsonFieldTarget | PolymarketTarget

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTarget(raw: string): ResolutionTarget | null {
  try {
    return JSON.parse(raw) as ResolutionTarget
  } catch {
    return null
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Ledge/1.0 resolver' },
      cache: 'no-store',
    })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

// ── Resolvers ─────────────────────────────────────────────────────────────────

/**
 * ESPN STATUS_FINAL variants that indicate a truly completed game.
 * STATUS_POSTPONED / STATUS_SUSPENDED / STATUS_CANCELED → return 'unknown'
 * so the market stays open until it actually concludes.
 */
const ESPN_FINAL_STATUSES = new Set([
  'STATUS_FINAL',
  'STATUS_FINAL_OT',       // overtime
  'STATUS_FINAL_PEN',      // penalty shoot-out (soccer)
])

function resolveEspnGame(
  data: unknown,
  target: EspnGameTarget
): 'yes' | 'no' | 'unknown' {
  const events = (data as { events?: unknown[] })?.events
  if (!Array.isArray(events) || events.length === 0) return 'unknown'

  for (const event of events) {
    const competitions = (event as { competitions?: unknown[] })?.competitions
    if (!Array.isArray(competitions)) continue

    for (const comp of competitions) {
      // Require an explicit final-state status name — never rely on the
      // boolean `completed` flag alone, which can be true mid-OT on some feeds
      const statusName = (
        comp as { status?: { type?: { name?: string } } }
      )?.status?.type?.name ?? ''

      if (!ESPN_FINAL_STATUSES.has(statusName)) continue

      const competitors = (comp as { competitors?: unknown[] })?.competitors
      if (!Array.isArray(competitors)) continue

      const teamEntry = competitors.find((c) => {
        const abbr = (c as { team?: { abbreviation?: string } })?.team?.abbreviation
        return abbr?.toUpperCase() === target.team.toUpperCase()
      })

      if (!teamEntry) continue

      const winner = (teamEntry as { winner?: boolean })?.winner
      if (winner === undefined || winner === null) return 'unknown'

      if (target.condition === 'win') return winner ? 'yes' : 'no'
      return winner ? 'no' : 'yes'
    }
  }

  return 'unknown'
}

/**
 * Extract only the text content of <title> and <description> inside each
 * <item> block. Ignores channel-level metadata, stylesheet URLs, and tracking
 * pixels that could accidentally match common keywords.
 */
function extractItemText(xml: string): string {
  const parts: string[] = []
  const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let itemMatch: RegExpExecArray | null

  while ((itemMatch = itemPattern.exec(xml)) !== null) {
    const itemXml = itemMatch[1]

    const titleMatch = itemXml.match(
      /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i
    )
    if (titleMatch?.[1]) parts.push(titleMatch[1].trim())

    const descMatch = itemXml.match(
      /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i
    )
    if (descMatch?.[1]) {
      // Strip any embedded HTML tags from descriptions
      parts.push(descMatch[1].replace(/<[^>]+>/g, ' ').trim())
    }
  }

  return parts.join(' ')
}

function resolveRssKeyword(
  xml: string,
  target: RssKeywordTarget
): 'yes' | 'no' | 'unknown' {
  // Scope matching strictly to item titles + descriptions, not raw XML
  const itemText = extractItemText(xml).toLowerCase()
  if (!itemText) return 'unknown'

  const yesHits = target.yes_terms.filter((t) => itemText.includes(t.toLowerCase())).length
  const noHits = target.no_terms.filter((t) => itemText.includes(t.toLowerCase())).length

  if (yesHits === 0 && noHits === 0) return 'unknown'
  return yesHits >= noHits ? 'yes' : 'no'
}

function resolveJsonField(
  data: unknown,
  target: JsonFieldTarget
): 'yes' | 'no' | 'unknown' {
  const parts = target.path.split('.')
  let current: unknown = data

  for (const part of parts) {
    if (current === null || current === undefined) return 'unknown'
    current = (current as Record<string, unknown>)[part]
  }

  if (current === undefined || current === null) return 'unknown'
  return String(current).toLowerCase() === target.yes_value.toLowerCase()
    ? 'yes'
    : 'no'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempt deterministic resolution via direct HTTP GET.
 * Returns 'unknown' on any error — caller should then invoke Claude.
 */
export async function resolveFromSource(
  sourceUrl: string | null | undefined,
  targetKey: string | null | undefined
): Promise<'yes' | 'no' | 'unknown'> {
  if (!sourceUrl || !targetKey) return 'unknown'

  const target = parseTarget(targetKey)
  if (!target) return 'unknown'

  // Polymarket-mirrored markets resolve from the Gamma API by id, not the URL.
  if (target.type === 'polymarket') return resolvePolymarketOutcome(target.id)

  try {
    const res = await fetchWithTimeout(sourceUrl)
    if (!res.ok) return 'unknown'

    if (target.type === 'rss_keyword') {
      const xml = await res.text()
      return resolveRssKeyword(xml, target)
    }

    // JSON-based sources
    const data: unknown = await res.json()

    if (target.type === 'espn_game') return resolveEspnGame(data, target)
    if (target.type === 'json_field') return resolveJsonField(data, target)

    return 'unknown'
  } catch {
    return 'unknown'
  }
}
