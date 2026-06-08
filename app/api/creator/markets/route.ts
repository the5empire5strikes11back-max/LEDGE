/**
 * GET /api/creator/markets
 *
 * Returns the current user's own markets with per-market engagement data.
 * Used exclusively by the creator analytics panel in the profile screen.
 *
 * Data per market:
 *   id, title, category, status, hot_score (bets received), total_credits (volume),
 *   yes_percent, resolved, winner, end_time, created_at
 *
 * Ordered by created_at DESC so the most recent appear first.
 * Excludes archived/deleted markets older than 90 days to keep the list fresh.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export interface CreatorMarket {
  id: string
  title: string
  category: 'Sports' | 'Politics' | 'Culture' | 'Circle'
  status: 'live' | 'review' | 'queued' | 'archived'
  hot_score: number
  total_credits: number
  yes_percent: number
  resolved: boolean
  winner: 'yes' | 'no' | null
  end_time: string
  created_at: string
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // 90-day lookback — enough history to be useful, not so long it's noise
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString()

  const { data, error } = await admin
    .from('markets')
    .select('id, title, category, status, hot_score, total_credits, yes_percent, resolved, winner, end_time, created_at')
    .eq('created_by', user.id)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Normalise nulls so the client never has to guard
  const markets: CreatorMarket[] = (data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    category: m.category as CreatorMarket['category'],
    status: (m.status ?? 'live') as CreatorMarket['status'],
    hot_score: m.hot_score ?? 0,
    total_credits: m.total_credits ?? 0,
    yes_percent: m.yes_percent ?? 50,
    resolved: m.resolved ?? false,
    winner: m.winner as 'yes' | 'no' | null,
    end_time: m.end_time,
    created_at: m.created_at,
  }))

  return NextResponse.json(markets)
}
