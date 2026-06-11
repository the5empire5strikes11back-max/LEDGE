/**
 * Resolution-source validation.
 *
 * A market can only auto-resolve from data if its resolution_source_url + the
 * target_data_key actually point at a live, parseable feed. An audit found
 * markets pointed at 404 URLs (e.g. an ESPN path missing `/scoreboard`, or
 * `/news/sport/rss.xml` which doesn't exist) — those silently fail at resolution
 * and used to fall through to a crowd-vote guess.
 *
 * This module gates sources at GENERATION time so a market with a dead or
 * malformed source never gets published. Resolution then either reads real data
 * or voids+refunds — it never guesses.
 */

/** RSS feeds known to be live + parseable (verified). The generator must use one of these. */
export const RSS_FEED_ALLOWLIST: readonly string[] = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
  'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
  'https://feeds.bbci.co.uk/news/technology/rss.xml',
  'https://feeds.bbci.co.uk/sport/rss.xml', // NOTE: /sport/, NOT /news/sport/ (that 404s)
]

/** ESPN scoreboard endpoints must match this exact shape to be resolvable. */
const ESPN_SCOREBOARD = /^https:\/\/site\.api\.espn\.com\/apis\/site\/v2\/sports\/[a-z]+\/[a-z0-9.\-]+\/scoreboard$/

/** Host allowed for json_field resolution (ESPN's public JSON API). */
const JSON_ALLOWED_HOST = 'site.api.espn.com'

type ParsedTarget = { type?: string; team?: unknown; path?: unknown; yes_terms?: unknown; no_terms?: unknown }

function parse(raw: string | null | undefined): ParsedTarget | null {
  if (!raw) return null
  try { return JSON.parse(raw) as ParsedTarget } catch { return null }
}

export interface SourceCheck {
  ok: boolean
  reason?: string
}

/**
 * Validate that a market's resolution source is structurally resolvable.
 * Returns { ok:false, reason } for dead/malformed sources so the pipeline can
 * reject the market before it's ever published.
 */
export function checkResolutionSource(
  resolutionSourceUrl: string | null | undefined,
  targetDataKey: string | null | undefined
): SourceCheck {
  const url = (resolutionSourceUrl ?? '').trim()
  if (!url) return { ok: false, reason: 'no resolution_source_url' }
  if (!url.startsWith('https://')) return { ok: false, reason: 'source url not https' }

  const target = parse(targetDataKey)
  if (!target || !target.type) return { ok: false, reason: 'missing/malformed target_data_key' }

  switch (target.type) {
    case 'espn_game': {
      if (!ESPN_SCOREBOARD.test(url)) {
        return { ok: false, reason: `espn_game url must be a /scoreboard endpoint (got ${url})` }
      }
      if (!target.team || String(target.team).trim() === '') {
        return { ok: false, reason: 'espn_game missing team' }
      }
      return { ok: true }
    }
    case 'json_field': {
      let host: string
      try { host = new URL(url).host } catch { return { ok: false, reason: 'json_field url unparseable' } }
      if (host !== JSON_ALLOWED_HOST) return { ok: false, reason: `json_field host not allowed (${host})` }
      if (!target.path || String(target.path).trim() === '') return { ok: false, reason: 'json_field missing path' }
      return { ok: true }
    }
    case 'rss_keyword': {
      if (!RSS_FEED_ALLOWLIST.includes(url)) {
        return { ok: false, reason: `rss feed not on allowlist (${url})` }
      }
      const yes = Array.isArray(target.yes_terms) ? target.yes_terms : []
      const no = Array.isArray(target.no_terms) ? target.no_terms : []
      if (yes.length === 0 || no.length === 0) {
        return { ok: false, reason: 'rss_keyword needs both yes_terms and no_terms' }
      }
      return { ok: true }
    }
    default:
      return { ok: false, reason: `unknown target type: ${target.type}` }
  }
}
