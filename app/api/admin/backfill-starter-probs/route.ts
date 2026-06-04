/**
 * POST /api/admin/backfill-starter-probs
 *
 * One-shot backfill: finds all live/queued markets with symmetric virtual pools
 * (yes_percent == 50 and virtual_yes_pool == virtual_no_pool) and asks Claude
 * Haiku to estimate a starter_probability for each title. Then updates the
 * virtual pools and yes_percent in-place.
 *
 * No real bet data is modified — only the virtual liquidity seed is updated.
 * Once real bets arrive the virtual decay already handles price discovery.
 *
 * Auth: CRON_SECRET (same bearer token used by cron routes)
 * Safe to run multiple times — only targets symmetric markets.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { BASE_LIQUIDITY, FEATURED_LIQUIDITY_BONUS, type MarketCategory } from '@/lib/liquidity'

export const maxDuration = 60

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const supabase = createAdminClient()

  // ── 1. Fetch all symmetric markets (unset starter_probability) ────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: markets, error: fetchErr } = await (supabase as any)
    .from('markets')
    .select('id, title, category, yes_percent, virtual_yes_pool, virtual_no_pool, is_featured, resolved')
    .or('status.eq.live,status.eq.queued,status.is.null')
    .eq('resolved', false)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // Only process markets where virtual pools are still equal (symmetric seed)
  const symmetric = (markets ?? []).filter(
    (m: { virtual_yes_pool: number; virtual_no_pool: number }) =>
      m.virtual_yes_pool === m.virtual_no_pool
  )

  if (symmetric.length === 0) {
    return NextResponse.json({ success: true, updated: 0, message: 'All markets already have asymmetric pools.' })
  }

  // ── 2. Ask Claude Haiku to estimate starter_probability for each title ────
  const client = new Anthropic({ apiKey })

  const titlesBlock = symmetric
    .map((m: { id: string; title: string; category: string }, i: number) =>
      `${i + 1}. [${m.category}] ${m.title}`
    )
    .join('\n')

  const prompt = `You are estimating starter probabilities for prediction markets on a Gen Z betting app.

For each market below, provide your best estimate (30–70) of the YES likelihood based on the topic, typical base rates, and how the question is framed.

Guidelines:
- 50 = genuinely uncertain / coin-flip
- Favourite wins tonight → 55–65
- Underdog upset → 32–44
- Incumbent / front-runner holds position → 58–68
- Celebrity doing something dramatic/unlikely → 32–42
- Policy or bill passing with strong support → 60–68
- Controversial uncertain outcome → 45–55

Never go below 30 or above 70 — markets must stay debatable.

Markets:
${titlesBlock}

Return ONLY a JSON array of objects in order, no other text:
[{"id": 1, "probability": 55}, {"id": 2, "probability": 42}, ...]`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    return NextResponse.json({ error: `No JSON in Claude response: ${text.slice(0, 200)}` }, { status: 500 })
  }

  const estimates: Array<{ id: number; probability: number }> = JSON.parse(jsonMatch[0])

  // ── 3. Update each market's virtual pools ─────────────────────────────────
  let updatedCount = 0
  const skipped: string[] = []

  for (const est of estimates) {
    const idx = est.id - 1  // 1-based to 0-based
    const market = symmetric[idx]
    if (!market) { skipped.push(`#${est.id} (out of range)`); continue }

    const rawProb = est.probability ?? 50
    const prob = Math.max(30, Math.min(70, Math.round(rawProb))) / 100

    // Reconstruct pool size from BASE_LIQUIDITY (same as original seedLiquidity call)
    const base = BASE_LIQUIDITY[market.category as MarketCategory] ?? BASE_LIQUIDITY['Culture']
    const bonus = market.is_featured ? FEATURED_LIQUIDITY_BONUS : 0
    const pool = base + bonus

    const newYesPool = Math.round(pool * prob)
    const newNoPool  = Math.round(pool * (1 - prob))
    const newYesPercent = Math.round(prob * 100)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .from('markets')
      .update({
        virtual_yes_pool: newYesPool,
        virtual_no_pool:  newNoPool,
        yes_percent:      newYesPercent,
      })
      .eq('id', market.id)

    if (updateErr) {
      skipped.push(`${market.title} (${updateErr.message})`)
    } else {
      updatedCount++
    }
  }

  return NextResponse.json({
    success: true,
    found_symmetric: symmetric.length,
    updated: updatedCount,
    skipped: skipped.length > 0 ? skipped : undefined,
  })
}
