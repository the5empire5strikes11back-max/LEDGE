/**
 * Market groups — every market "type" is a group of binary YES/NO markets with
 * two knobs: how many options, and whether exactly one wins (exclusive) or any
 * number can (independent). This lets all types reuse Ledge's binary engine.
 *
 *   yes_no          → 1 option
 *   multiple_choice → N options, exclusive (exactly one resolves YES)
 *   numeric         → N options that are value ranges, exclusive
 *   date            → N options that are time windows, exclusive
 *   set             → N options, independent (any number resolve YES)
 *
 * Poll is handled separately (votes, no odds).
 */

export type GroupType = 'yes_no' | 'multiple_choice' | 'numeric' | 'date' | 'set'

export const GROUP_EXCLUSIVE: Record<GroupType, boolean> = {
  yes_no: true,
  multiple_choice: true,
  numeric: true,
  date: true,
  set: false,
}

/** Turn a numeric question into tappable ranges — the usable alternative to
 *  Manifold's confusing numeric input. e.g. (0, 50, 4) → ["<10","10–24","25–49","50+"] */
export function numericBuckets(min: number, max: number, count = 4): string[] {
  const lo = Math.floor(Math.min(min, max))
  const hi = Math.ceil(Math.max(min, max))
  const n = Math.max(2, Math.min(8, Math.floor(count)))
  const step = Math.max(1, Math.ceil((hi - lo) / n))

  const out: string[] = []
  let start = lo
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(`${start}+`)
    } else {
      const end = start + step - 1
      out.push(`${start}–${end}`)
    }
    start += step
  }
  if (lo > 0) out.unshift(`< ${lo}`)
  return out
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Turn a date question into tappable time windows. e.g. now..+1yr in 4 →
 *  ["By Sep 2026","By Dec 2026","By Mar 2027","Later / Never"] */
export function dateBuckets(startIso: string, endIso: string, count = 4): string[] {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return []
  const n = Math.max(2, Math.min(8, Math.floor(count)))
  const step = (end - start) / n

  const out: string[] = []
  for (let i = 1; i <= n; i++) {
    const d = new Date(start + step * i)
    out.push(`By ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`)
  }
  out.push('Later / Never')
  return out
}

/** Validate a set of option labels for a manual type (MC / Set). */
export function normalizeOptions(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of raw) {
    const t = (r ?? '').trim()
    if (!t || t.length > 80) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= 12) break
  }
  return out
}
