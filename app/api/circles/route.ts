import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberships } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('user_id', user.id)

  const circleIds = memberships?.map((m) => m.circle_id) ?? []
  if (circleIds.length === 0) return NextResponse.json([])

  const { data: rawCircles, error } = await supabase
    .from('circles')
    .select(`*, circle_members(user_id, profiles(id, username, rank, credits))`)
    .in('id', circleIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type CircleRow = {
    id: string
    name: string
    created_by: string
    invite_code: string
    created_at: string
    circle_members: Array<{
      user_id: string
      profiles: { id: string; username: string; rank: string; credits: number } | null
    }>
  }
  const circles = (rawCircles ?? []) as CircleRow[]

  // Compute weekly credit change per member using pnl_snapshots
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Collect all member IDs across all circles
  const allMemberIds = new Set<string>()
  for (const circle of circles) {
    for (const m of circle.circle_members ?? []) {
      if (m.profiles?.id) allMemberIds.add(m.profiles.id)
    }
  }

  // Fetch the oldest snapshot from the last 7 days per member
  const memberIdList = [...allMemberIds]
  const weeklyChangeMap = new Map<string, number>()

  if (memberIdList.length > 0) {
    const { data: snapshots } = await supabase
      .from('pnl_snapshots')
      .select('user_id, credits, created_at')
      .in('user_id', memberIdList)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: true })

    // For each member, use the earliest snapshot this week as baseline
    const baselineMap = new Map<string, number>()
    for (const snap of snapshots ?? []) {
      if (!baselineMap.has(snap.user_id)) {
        baselineMap.set(snap.user_id, snap.credits)
      }
    }

    // weeklyChange = current credits - baseline
    for (const circle of circles) {
      for (const m of circle.circle_members ?? []) {
        if (!m.profiles) continue
        const baseline = baselineMap.get(m.profiles.id)
        weeklyChangeMap.set(
          m.profiles.id,
          baseline !== undefined ? m.profiles.credits - baseline : 0
        )
      }
    }
  }

  // Attach weeklyChange to each member
  const enriched = circles.map((circle) => ({
    ...circle,
    circle_members: (circle.circle_members ?? []).map((m) => ({
      ...m,
      weeklyChange: m.profiles ? (weeklyChangeMap.get(m.profiles.id) ?? 0) : 0,
    })),
  }))

  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name } = body as { name?: string }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Circle name is required' }, { status: 400 })
  }

  const { data: circle, error } = await supabase
    .from('circles')
    .insert({ name: name.trim(), created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('circle_members').insert({ circle_id: circle.id, user_id: user.id })

  return NextResponse.json(circle, { status: 201 })
}
