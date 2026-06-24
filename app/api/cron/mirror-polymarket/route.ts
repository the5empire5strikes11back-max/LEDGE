/**
 * POST /api/cron/mirror-polymarket
 *
 * Mirrors the top active Polymarket markets into Ledge using Polymarket's real,
 * calibrated prices — so these markets show real-world odds, not fake-money
 * guesses, and resolve to Polymarket's actual settled outcome. Idempotent:
 * new markets are inserted; existing unresolved ones are re-synced to the
 * current Polymarket price.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { fetchTopPolymarketMarkets } from '@/lib/polymarket'
import { seedReserves } from '@/lib/amm'
import { fireEligibleAutoBets } from '@/lib/auto-bet-trigger'
import { NextResponse } from 'next/server'

export const maxDuration = 60

// Deep virtual liquidity so Ledge's small crowd barely moves the mirrored price
// (the whole point is to track Polymarket, not drift toward a thin crowd).
const MIRROR_DEPTH = 24_000

type Category = 'Sports' | 'Politics' | 'Culture' | 'Tech' | 'Viral' | 'Wild'

function mapCategory(q: string): Category {
  const s = q.toLowerCase()
  // Dated match-outcome markets ("Will X win on 2026-06-19?") + sports leagues.
  if (/win on \d{4}-\d{2}-\d{2}/.test(s)) return 'Sports'
  if (/\b(world cup|nba|nfl|mlb|nhl|premier league|champions league|win the|beat|match|game|vs\.?|fight|ufc|super bowl|playoffs|league|score|grand prix|tournament)\b/.test(s)) return 'Sports'
  if (/\b(election|president|senate|congress|governor|prime minister|parliament|trump|biden|democrat|republican|nominee|cabinet|impeach|sanction|ceasefire|\bwar\b|diplomatic|treaty|strait|hostage|nato|nuclear)\b/.test(s)) return 'Politics'
  if (/\b(bitcoin|ethereum|crypto|btc|eth|solana|token|blockchain|ai|openai|gpt|nvidia|tesla|stock|fed|rate cut|gdp|inflation|earnings)\b/.test(s)) return 'Tech'
  if (/\b(movie|album|song|oscar|grammy|box office|netflix|spotify|celebrity|tour|chart|award|\btv\b|show|film)\b/.test(s)) return 'Culture'
  return 'Wild'
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const userClient = await import('@/lib/supabase/server').then((m) => m.createClient())
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const markets = await fetchTopPolymarketMarkets(12)
  if (markets.length === 0) {
    return NextResponse.json({ imported: 0, resynced: 0, message: 'No suitable Polymarket markets' })
  }

  // Existing unresolved mirrored markets → map by polymarket id for dedup/resync.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (admin as any)
    .from('markets')
    .select('id, target_data_key')
    .eq('resolved', false)
    .ilike('target_data_key', '%"type":"polymarket"%')
  const byPolyId = new Map<string, string>()
  for (const m of (existing ?? []) as Array<{ id: string; target_data_key: string }>) {
    try {
      const k = JSON.parse(m.target_data_key) as { id?: string }
      if (k.id) byPolyId.set(String(k.id), m.id)
    } catch { /* ignore */ }
  }

  let imported = 0
  let resynced = 0

  for (const pm of markets) {
    const yesPct = Math.round(pm.yesPrice * 1000) / 10
    const virtualYes = Math.round(MIRROR_DEPTH * pm.yesPrice)
    const virtualNo = MIRROR_DEPTH - virtualYes
    const targetKey = JSON.stringify({ type: 'polymarket', id: pm.id })
    const sourceUrl = pm.slug ? `https://polymarket.com/event/${pm.slug}` : 'https://polymarket.com'

    const existingId = byPolyId.get(pm.id)
    if (existingId) {
      // Re-sync the live price. Re-seed the AMM reserves to Polymarket's price at
      // mirror depth so the tradeable price tracks the source (these markets are
      // externally priced by design), then fire any auto-bets the move crossed.
      const reserves = seedReserves(yesPct / 100, MIRROR_DEPTH)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from('markets').update({
        yes_percent: yesPct,
        yes_shares: reserves.y,
        no_shares: reserves.n,
        virtual_yes_pool: virtualYes,
        virtual_no_pool: virtualNo,
        category: mapCategory(pm.question),
      }).eq('id', existingId)
      await fireEligibleAutoBets(admin, existingId)
      resynced++
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seeded = seedReserves(yesPct / 100, MIRROR_DEPTH)
    const { error } = await (admin as any).from('markets').insert({
      title: pm.question,
      category: mapCategory(pm.question),
      yes_percent: yesPct,
      yes_shares: seeded.y,
      no_shares: seeded.n,
      virtual_yes_pool: virtualYes,
      virtual_no_pool: virtualNo,
      yes_pool: 0,
      no_pool: 0,
      total_credits: 0,
      hot_score: 0,
      end_time: pm.endDate,
      resolved: false,
      resolution_criteria: 'Resolves YES or NO per Polymarket’s official settled outcome.',
      resolution_source_url: sourceUrl,
      target_data_key: targetKey,
    })
    if (!error) imported++
  }

  return NextResponse.json({ imported, resynced, fetched: markets.length })
}
