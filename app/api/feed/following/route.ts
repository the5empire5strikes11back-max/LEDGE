/**
 * GET /api/feed/following
 *
 * Returns activity from users the current user follows.
 * Merges two streams — recent bets + recently created markets — sorted by time.
 *
 * Shape:
 *   { items: FeedItem[], following_count: number }
 *
 * FeedItem:
 *   type "bet"    — someone you follow placed a bet
 *   type "market" — someone you follow created a market
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export interface FeedItem {
  type: 'bet' | 'market'
  id: string
  username: string
  avatar_url: string | null
  created_at: string
  // bet fields
  side?: 'yes' | 'no'
  won?: boolean | null
  amount?: number
  market_id?: string
  market_title?: string
  // market fields
  category?: string
  yes_percent?: number
  resolved?: boolean
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Who does the current user follow?
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: followRows } = await (admin as any)
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', user.id) as { data: Array<{ following_id: string }> | null }

  const followingIds = (followRows ?? []).map((r) => r.following_id)
  if (followingIds.length === 0) {
    return NextResponse.json({ items: [], following_count: 0 })
  }

  // Profiles for all followed users (username + avatar)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profileRows } = await (admin as any)
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', followingIds) as { data: Array<{ id: string; username: string; avatar_url: string | null }> | null }

  const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]))

  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString() // last 7 days

  // Recent bets from followed users
  const { data: betRows } = await admin
    .from('bets')
    .select('id, user_id, side, won, amount, created_at, market_id, markets(title)')
    .in('user_id', followingIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(60) as {
      data: Array<{
        id: string; user_id: string; side: string; won: boolean | null; amount: number
        created_at: string; market_id: string
        markets: { title: string } | null
      }> | null
    }

  // Recent markets created by followed users
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: marketRows } = await (admin as any)
    .from('markets')
    .select('id, created_by, title, category, yes_percent, resolved, created_at')
    .in('created_by', followingIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20) as {
      data: Array<{
        id: string; created_by: string; title: string; category: string
        yes_percent: number; resolved: boolean; created_at: string
      }> | null
    }

  const betItems: FeedItem[] = (betRows ?? []).map((b) => {
    const p = profileMap.get(b.user_id)
    return {
      type:         'bet',
      id:           `bet-${b.id}`,
      username:     p?.username ?? 'unknown',
      avatar_url:   p?.avatar_url ?? null,
      created_at:   b.created_at,
      side:         b.side as 'yes' | 'no',
      won:          b.won,
      amount:       b.amount,
      market_id:    b.market_id,
      market_title: b.markets?.title ?? 'Unknown market',
    }
  })

  const marketItems: FeedItem[] = (marketRows ?? []).map((m) => {
    const p = profileMap.get(m.created_by)
    return {
      type:        'market',
      id:          `market-${m.id}`,
      username:    p?.username ?? 'unknown',
      avatar_url:  p?.avatar_url ?? null,
      created_at:  m.created_at,
      market_id:   m.id,
      market_title: m.title,
      category:    m.category,
      yes_percent: m.yes_percent,
      resolved:    m.resolved,
    }
  })

  const items = [...betItems, ...marketItems]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 60)

  return NextResponse.json({ items, following_count: followingIds.length })
}
