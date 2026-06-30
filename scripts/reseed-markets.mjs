/**
 * One-off: drive the production AI market generator to refill the feed after a
 * wipe. Calls /api/cron/refresh-markets (generates + scores + queues + primes)
 * and /api/cron/release-markets (drips queued → live) until the live feed
 * reaches TARGET, then reports the final state.
 *
 * Each generated market carries resolution_source_url + target_data_key — the
 * "new systems" (ESPN auto-resolve, resolution-source chips, live indicators).
 *
 * Reads credentials from .env.local — never prints secret values.
 * Usage: node scripts/reseed-markets.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

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
// Drive the LOCAL dev server (NODE_ENV=development bypasses cron auth), which
// writes to the same prod Supabase project that .env.local points to.
const BASE = process.env.RESEED_BASE || 'http://localhost:3007'
const SECRET = env.CRON_SECRET
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const TARGET = 90
const MAX_ROUNDS = 12
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function liveCount() {
  const { count } = await db
    .from('markets')
    .select('id', { count: 'exact', head: true })
    .or('status.eq.live,status.is.null')
    .eq('resolved', false)
    .is('circle_id', null)
  return count ?? 0
}

async function queuedCount() {
  const { count } = await db
    .from('markets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
  return count ?? 0
}

async function hit(path) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    })
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err) } }
  }
}

console.log(`Target ${TARGET} live markets. Starting from ${await liveCount()} live / ${await queuedCount()} queued.\n`)

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const live = await liveCount()
  if (live >= TARGET) {
    console.log(`\n✓ Reached ${live} live markets (≥ ${TARGET}).`)
    break
  }

  process.stdout.write(`Round ${round}: generating… `)
  const gen = await hit('/api/cron/refresh-markets')
  const g = gen.body
  console.log(
    gen.ok
      ? `generated=${g.generated ?? '?'} queued=${g.queued ?? '?'} primed=${g.primed ?? '?'}`
      : `FAILED (${gen.status}) ${JSON.stringify(g).slice(0, 160)}`
  )

  // Drip any queued markets into the live feed
  const rel = await hit('/api/cron/release-markets')
  if (rel.ok && (rel.body.released ?? 0) > 0) {
    console.log(`         released ${rel.body.released} queued → live`)
  }

  console.log(`         now ${await liveCount()} live / ${await queuedCount()} queued`)

  // Generation hits Claude + RSS; pace requests to be gentle
  await sleep(3000)
}

// ── Final report ────────────────────────────────────────────────────────────
const { data: byCat } = await db
  .from('markets')
  .select('category')
  .or('status.eq.live,status.is.null')
  .eq('resolved', false)
  .is('circle_id', null)

const counts = {}
for (const r of byCat ?? []) counts[r.category] = (counts[r.category] ?? 0) + 1

const { count: withSource } = await db
  .from('markets')
  .select('id', { count: 'exact', head: true })
  .not('resolution_source_url', 'is', null)
  .neq('resolution_source_url', '')

console.log('\n── FINAL FEED ──────────────────────────')
console.log('live markets      :', (byCat ?? []).length)
console.log('by category       :', JSON.stringify(counts))
console.log('with resolution src:', withSource ?? 0, '(new ESPN/RSS auto-resolve system)')
console.log('queued (backlog)  :', await queuedCount())
console.log('\nDone.')
