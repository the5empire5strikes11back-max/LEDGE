import { isAdminRequest } from '@/lib/validate'
/**
 * GET /api/markets/quality-debug
 *
 * Admin endpoint: shows quality score distribution across live + queued markets.
 * Useful for understanding what the scorer is accepting/rejecting.
 *
 * Also accepts ?run=1 to score a small set of sample titles (no DB write).
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { scoreMarkets, formatScoringLog } from '@/lib/market-scorer'
import type { GeneratedMarket } from '@/lib/market-generator'

export const maxDuration = 30

// Sample markets for manual scoring test — covers the full quality spectrum
const SAMPLE_MARKETS: GeneratedMarket[] = [
  {
    title: 'Will the Lakers beat the Celtics tonight?',
    category: 'Sports',
    end_time: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    jackpot_pool: 50000,
    starter_probability: 48,
    resolution_criteria: 'YES if Lakers win per NBA box score.',
    resolution_source_url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    target_data_key: '{"type":"espn_game","team":"LAL","condition":"win"}',
  },
  {
    title: 'Will Taylor Swift attend the Super Bowl?',
    category: 'Culture',
    end_time: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    jackpot_pool: 75000,
    starter_probability: 62,
    resolution_criteria: 'YES if Taylor Swift is photographed at the Super Bowl venue.',
    resolution_source_url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    target_data_key: '{"type":"rss_keyword","yes_terms":["Taylor Swift Super Bowl","Swift attends"],"no_terms":["Taylor Swift skips","not attending"]}',
  },
  {
    title: 'Will the Federal Reserve cut interest rates at the next FOMC meeting?',
    category: 'Politics',
    end_time: new Date(Date.now() + 72 * 3_600_000).toISOString(),
    jackpot_pool: 25000,
    starter_probability: 50,
    resolution_criteria: 'YES if the Fed announces a rate cut.',
    resolution_source_url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    target_data_key: '{"type":"rss_keyword","yes_terms":["Fed cuts rates","FOMC rate cut"],"no_terms":["Fed holds rates","no rate change"]}',
  },
  {
    title: 'Will Drake drop a diss track in the next 24 hours?',
    category: 'Culture',
    end_time: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    jackpot_pool: 60000,
    starter_probability: 35,
    resolution_criteria: 'YES if Drake releases a diss track or response song.',
    resolution_source_url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    target_data_key: '{"type":"rss_keyword","yes_terms":["Drake diss track","Drake drops","Drake responds"],"no_terms":["Drake silent","no response from Drake"]}',
  },
  {
    title: 'Will the quarterly GDP growth figures disappoint analysts?',
    category: 'Politics',
    end_time: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    jackpot_pool: 15000,
    starter_probability: 50,
    resolution_criteria: 'YES if GDP growth is below analyst consensus.',
    resolution_source_url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    target_data_key: '{"type":"rss_keyword","yes_terms":["GDP disappoints","below forecast"],"no_terms":["GDP beats","exceeds expectations"]}',
  },
]

export async function GET(request: Request) {
  // Admin-only — uses the service-role client below, so gate before any work.
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user || !isAdminRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const url = new URL(request.url)
  const runSample = url.searchParams.get('run') === '1'

  // ── Live quality score distribution ───────────────────────────────────────
  const { data: markets } = await supabase
    .from('markets')
    .select('id, title, category, quality_score, status, resolved')
    .in('status', ['live', 'queued'])
    .order('quality_score', { ascending: false })

  const scores = (markets ?? []).map((m) => m.quality_score ?? null)
  const nonNull = scores.filter((s): s is number => s !== null)

  const distribution = {
    total: (markets ?? []).length,
    with_score: nonNull.length,
    null_legacy: scores.length - nonNull.length,
    avg: nonNull.length > 0 ? Math.round(nonNull.reduce((a, b) => a + b, 0) / nonNull.length) : null,
    min: nonNull.length > 0 ? Math.min(...nonNull) : null,
    max: nonNull.length > 0 ? Math.max(...nonNull) : null,
    buckets: {
      excellent:  nonNull.filter((s) => s >= 80).length,  // 80–100
      good:       nonNull.filter((s) => s >= 65 && s < 80).length, // 65–79
      acceptable: nonNull.filter((s) => s >= 50 && s < 65).length, // 50–64 (legacy)
      weak:       nonNull.filter((s) => s < 50).length,   // below 50 (shouldn't exist)
    },
  }

  const topMarkets = (markets ?? [])
    .filter((m) => m.quality_score !== null)
    .slice(0, 10)
    .map((m) => ({ title: m.title, category: m.category, quality_score: m.quality_score, status: m.status }))

  // ── Optional: run scorer on sample titles ─────────────────────────────────
  let sampleResult: object | null = null
  let sampleLog = ''

  if (runSample) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })
    }
    try {
      const result = await scoreMarkets(SAMPLE_MARKETS, apiKey)
      sampleLog = formatScoringLog(result)
      sampleResult = {
        accepted: result.accepted.map((m) => ({ title: m.title, quality_score: m.quality_score })),
        rejected: result.rejected.map((r) => ({ title: r.market.title, reason: r.reason, scores: r.scores })),
        stats: result.scoring_stats,
      }
    } catch (err) {
      sampleResult = { error: String(err) }
    }
  }

  return NextResponse.json({
    distribution,
    top_markets: topMarkets,
    ...(runSample ? { sample_run: sampleResult, sample_log: sampleLog } : {}),
  })
}
