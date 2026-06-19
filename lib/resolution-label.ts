/**
 * Resolution label helpers — parse target_data_key + source URL into
 * human-readable labels for the "Resolves via …" chips and
 * "Auto-resolved ✓ …" badges shown on market cards and detail views.
 */

export interface ResolutionMeta {
  /** Short human-readable source name, e.g. "ESPN NBA", "BBC Sport" */
  label: string
  /** Whether this market auto-resolves (all structured types do) */
  isAuto: boolean
  /** Resolution mechanism type for icon selection */
  type: 'espn' | 'rss' | 'json' | 'polymarket' | 'unknown'
}

function parseDataKeyType(targetDataKey: string | null | undefined): string | null {
  try {
    if (!targetDataKey) return null
    const k = JSON.parse(targetDataKey)
    return typeof k?.type === 'string' ? k.type : null
  } catch {
    return null
  }
}

function labelFromUrl(url: string): string {
  if (url.includes('site.api.espn.com')) {
    if (url.includes('/basketball/nba')) return 'ESPN NBA'
    if (url.includes('/football/nfl'))   return 'ESPN NFL'
    if (url.includes('/baseball/mlb'))   return 'ESPN MLB'
    if (url.includes('/hockey/nhl'))     return 'ESPN NHL'
    if (url.includes('/soccer/eng.1'))   return 'ESPN Premier League'
    if (url.includes('/soccer/esp.1'))   return 'ESPN La Liga'
    if (url.includes('/soccer/uefa'))    return 'ESPN Champions League'
    if (url.includes('/soccer'))         return 'ESPN Football'
    return 'ESPN'
  }
  if (url.includes('espn.com')) return 'ESPN'
  if (url.includes('bbci.co.uk/sport/football')) return 'BBC Football'
  if (url.includes('bbci.co.uk/sport'))          return 'BBC Sport'
  if (url.includes('bbci.co.uk/news/world/us_and_canada')) return 'BBC US News'
  if (url.includes('bbci.co.uk/news/entertainment'))       return 'BBC Entertainment'
  if (url.includes('bbci.co.uk/news/technology'))          return 'BBC Tech'
  if (url.includes('bbci.co.uk'))                          return 'BBC News'
  if (url.includes('billboard.com'))  return 'Billboard'
  if (url.includes('variety.com'))    return 'Variety'
  if (url.includes('deadline.com'))   return 'Deadline'
  if (url.includes('theverge.com'))   return 'The Verge'
  return 'Official source'
}

/**
 * Derive resolution metadata from a market's source URL and data key.
 * Safe to call with nulls — always returns a usable label.
 */
export function getResolutionMeta(
  resolutionSourceUrl: string | null | undefined,
  targetDataKey: string | null | undefined
): ResolutionMeta {
  const dataKeyType = parseDataKeyType(targetDataKey)
  const url = resolutionSourceUrl ?? ''

  if (dataKeyType === 'espn_game') {
    return { label: labelFromUrl(url), isAuto: true, type: 'espn' }
  }
  if (dataKeyType === 'rss_keyword') {
    return { label: labelFromUrl(url), isAuto: true, type: 'rss' }
  }
  if (dataKeyType === 'json_field') {
    return { label: labelFromUrl(url), isAuto: true, type: 'json' }
  }
  if (dataKeyType === 'polymarket') {
    return { label: 'Polymarket', isAuto: true, type: 'polymarket' }
  }
  if (url) {
    return { label: labelFromUrl(url), isAuto: false, type: 'unknown' }
  }

  return { label: 'Official source', isAuto: false, type: 'unknown' }
}

/** Format a resolved_at ISO string into a readable timestamp, e.g. "Jun 10 · 3:45 PM" */
export function formatResolvedAt(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    const month = d.toLocaleString('en-US', { month: 'short' })
    const day   = d.getDate()
    const time  = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${month} ${day} · ${time}`
  } catch {
    return null
  }
}
