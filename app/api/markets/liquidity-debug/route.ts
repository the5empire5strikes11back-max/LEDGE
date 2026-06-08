import { isAdminRequest } from '@/lib/validate'
/**
 * GET /api/markets/liquidity-debug
 *
 * Returns per-market liquidity breakdown for monitoring.
 * Shows real vs effective pools, decay factor, and market depth label.
 * Admin/dev endpoint — not exposed in the UI.
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeYesPercent, virtualDecayFactor, liquidityLabel, type PoolState } from '@/lib/liquidity'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: markets, error } = await (supabase as any)
    .from('markets')
    .select('id, title, category, yes_pool, no_pool, yes_percent, hot_score, virtual_yes_pool, virtual_no_pool, is_featured, resolved')
    .eq('resolved', false)
    .order('hot_score', { ascending: false })
    .limit(50) as {
      data: Array<{
        id: string; title: string; category: string; yes_pool: number; no_pool: number
        yes_percent: number; hot_score: number; virtual_yes_pool: number; virtual_no_pool: number
        is_featured: boolean; resolved: boolean
      }> | null
      error: { message: string } | null
    }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (markets ?? []).map((m) => {
    const state: PoolState = {
      yes_pool:         m.yes_pool         ?? 0,
      no_pool:          m.no_pool          ?? 0,
      virtual_yes_pool: m.virtual_yes_pool ?? 0,
      virtual_no_pool:  m.virtual_no_pool  ?? 0,
      hot_score:        m.hot_score        ?? 0,
    }

    const decay = virtualDecayFactor(state.hot_score)
    const effectiveVirtual = Math.round(state.virtual_yes_pool * decay)
    const adjustedYesPct = computeYesPercent(state)
    const rawYesPct =
      state.yes_pool + state.no_pool > 0
        ? Math.round((state.yes_pool / (state.yes_pool + state.no_pool)) * 100 * 10) / 10
        : 50

    return {
      title:          m.title.slice(0, 60),
      category:       m.category,
      is_featured:    m.is_featured,
      hot_score:      state.hot_score,
      // Real user pools
      real_yes:       state.yes_pool,
      real_no:        state.no_pool,
      real_total:     state.yes_pool + state.no_pool,
      // Virtual depth
      virtual_each:   state.virtual_yes_pool,
      effective_virtual: effectiveVirtual,
      decay_factor:   Math.round(decay * 100) + '%',
      depth_label:    liquidityLabel(state.virtual_yes_pool * 2, state.hot_score),
      // Odds comparison
      raw_yes_pct:    rawYesPct,    // what odds would be WITHOUT virtual liquidity
      adjusted_yes_pct: adjustedYesPct, // what users actually see
      db_yes_pct:     m.yes_percent, // stored value (should match adjusted)
      pct_delta:      Math.abs(adjustedYesPct - rawYesPct).toFixed(1) + 'pp',
    }
  })

  const summary = {
    total_open_markets: rows.length,
    avg_decay: Math.round(rows.reduce((s, r) => s + parseFloat(r.decay_factor), 0) / (rows.length || 1)) + '%',
    deep_markets:    rows.filter((r) => r.depth_label === 'deep').length,
    liquid_markets:  rows.filter((r) => r.depth_label === 'liquid').length,
    moderate_markets:rows.filter((r) => r.depth_label === 'moderate').length,
    thin_markets:    rows.filter((r) => r.depth_label === 'thin').length,
  }

  return NextResponse.json({ summary, markets: rows })
}
