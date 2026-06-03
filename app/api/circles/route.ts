import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit, LIMITS } from '@/lib/rate-limit'

// Readable uppercase invite code — excludes easily-confused chars (0/O, 1/I/L)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function GET() {
  // Authenticate via user client, then query via admin to bypass RLS
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data: memberships } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('user_id', user.id)

  const circleIds = memberships?.map((m) => m.circle_id) ?? []
  if (circleIds.length === 0) return NextResponse.json([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawCircles, error } = await (supabase as any)
    .from('circles')
    .select('*, circle_members(user_id, profiles(id, username, rank, credits, avatar_url))')
    .in('id', circleIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type CircleRow = {
    id: string
    name: string
    created_by: string
    invite_code: string
    created_at: string
    circle_avatar_url?: string | null
    circle_members: Array<{
      user_id: string
      profiles: { id: string; username: string; rank: string; credits: number; avatar_url?: string | null } | null
    }>
  }
  const circles = (rawCircles ?? []) as CircleRow[]

  // Weekly credit change via pnl_snapshots
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const allMemberIds = new Set<string>()
  for (const circle of circles) {
    for (const m of circle.circle_members ?? []) {
      if (m.profiles?.id) allMemberIds.add(m.profiles.id)
    }
  }

  const weeklyChangeMap = new Map<string, number>()
  if (allMemberIds.size > 0) {
    const { data: snapshots } = await supabase
      .from('pnl_snapshots')
      .select('user_id, credits')
      .in('user_id', [...allMemberIds])
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: true })

    const baselineMap = new Map<string, number>()
    for (const snap of snapshots ?? []) {
      if (!baselineMap.has(snap.user_id)) baselineMap.set(snap.user_id, snap.credits)
    }

    for (const circle of circles) {
      for (const m of circle.circle_members ?? []) {
        if (!m.profiles) continue
        const baseline = baselineMap.get(m.profiles.id)
        weeklyChangeMap.set(m.profiles.id, baseline !== undefined ? m.profiles.credits - baseline : 0)
      }
    }
  }

  // Recent activity: count bets placed in circle markets in the last 24 hours.
  // This drives the "X bets placed today" pulse on each circle card.
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const recentActivityMap = new Map<string, number>()

  if (circleIds.length > 0) {
    // Get all market IDs per circle
    const { data: circleMarkets } = await supabase
      .from('markets')
      .select('id, circle_id')
      .in('circle_id', circleIds)

    // Group market IDs by circle
    const marketsByCircle = new Map<string, string[]>()
    for (const m of circleMarkets ?? []) {
      if (!m.circle_id) continue
      const list = marketsByCircle.get(m.circle_id) ?? []
      list.push(m.id)
      marketsByCircle.set(m.circle_id, list)
    }

    // Count recent bets across all circle markets in one query
    const allCircleMarketIds = (circleMarkets ?? []).map((m) => m.id)
    if (allCircleMarketIds.length > 0) {
      const { data: recentBets } = await supabase
        .from('bets')
        .select('market_id')
        .in('market_id', allCircleMarketIds)
        .gte('created_at', oneDayAgo)

      // Tally per circle
      for (const bet of recentBets ?? []) {
        for (const [circleId, mIds] of marketsByCircle) {
          if (mIds.includes(bet.market_id)) {
            recentActivityMap.set(circleId, (recentActivityMap.get(circleId) ?? 0) + 1)
            break
          }
        }
      }
    }
  }

  const enriched = circles.map((circle) => ({
    ...circle,
    recent_bets_24h: recentActivityMap.get(circle.id) ?? 0,
    circle_members: (circle.circle_members ?? []).map((m) => ({
      ...m,
      weeklyChange: m.profiles ? (weeklyChangeMap.get(m.profiles.id) ?? 0) : 0,
    })),
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name } = body as { name?: string }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Circle name is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Rate limit — max 3 circles per hour
  const rl = await rateLimit(supabase, { key: `${user.id}:circlesCreate`, ...LIMITS.circlesCreate })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many circles created. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  // Generate a readable, uppercase invite code — retry on collision (extremely rare)
  let invite_code = generateInviteCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from('circles')
      .select('id')
      .eq('invite_code', invite_code)
      .maybeSingle()
    if (!existing) break
    invite_code = generateInviteCode()
  }

  const { data: circle, error } = await supabase
    .from('circles')
    .insert({ name: name.trim(), created_by: user.id, invite_code })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: memberError } = await supabase
    .from('circle_members')
    .insert({ circle_id: circle.id, user_id: user.id })

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })

  return NextResponse.json(circle, { status: 201 })
}
