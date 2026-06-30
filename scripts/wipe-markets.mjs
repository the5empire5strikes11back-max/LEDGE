/**
 * One-off: wipe ALL markets from the live DB.
 *
 * Deleting a market cascades (ON DELETE CASCADE) to its bets, comments, and
 * resolution records. Authorized full reset incl. circle markets.
 *
 * Reads credentials from .env.local — never prints secret values.
 * Usage: node scripts/wipe-markets.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Load .env.local (simple parser, values never logged) ────────────────────
function loadEnv() {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

async function count(table, filter) {
  let q = db.from(table).select('id', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count, error } = await q
  if (error) return `err(${error.message})`
  return count ?? 0
}

console.log('── BEFORE ──────────────────────────────')
console.log('markets total     :', await count('markets'))
console.log('  · circle markets :', await count('markets', (q) => q.not('circle_id', 'is', null)))
console.log('  · public markets :', await count('markets', (q) => q.is('circle_id', null)))
console.log('bets total        :', await count('bets'))
console.log('comments total    :', await count('comments'))

// ── Delete ALL markets. Supabase requires a filter; match every row by a
//    universally-true predicate on the UUID primary key. ──────────────────────
console.log('\nDeleting all markets (cascades to bets/comments)…')
const { error: delErr, count: deleted } = await db
  .from('markets')
  .delete({ count: 'exact' })
  .neq('id', '00000000-0000-0000-0000-000000000000')

if (delErr) {
  console.error('DELETE failed:', delErr.message)
  process.exit(1)
}
console.log('Deleted markets   :', deleted ?? '(unknown)')

console.log('\n── AFTER ───────────────────────────────')
console.log('markets total     :', await count('markets'))
console.log('bets total        :', await count('bets'))
console.log('comments total    :', await count('comments'))
console.log('\nDone.')
