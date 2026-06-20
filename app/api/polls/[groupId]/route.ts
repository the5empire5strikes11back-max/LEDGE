import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET  /api/polls/[groupId]  → vote counts per option + the caller's current vote
 * POST /api/polls/[groupId]  { option_market_id }  → cast/change the caller's vote
 *
 * One vote per user per poll (enforced by the poll_votes (group_id,user_id) PK).
 */

async function tally(admin: ReturnType<typeof createAdminClient>, groupId: string, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [optionsRes, votesRes] = await Promise.all([
    (admin as any).from('markets').select('id, option_label').eq('group_id', groupId).eq('group_type', 'poll'),
    (admin as any).from('poll_votes').select('option_market_id, user_id').eq('group_id', groupId),
  ])
  const votes = (votesRes.data ?? []) as Array<{ option_market_id: string; user_id: string }>
  const counts = new Map<string, number>()
  for (const v of votes) counts.set(v.option_market_id, (counts.get(v.option_market_id) ?? 0) + 1)
  const total = votes.length
  const userVote = votes.find((v) => v.user_id === userId)?.option_market_id ?? null

  const options = ((optionsRes.data ?? []) as Array<{ id: string; option_label: string }>).map((o) => {
    const n = counts.get(o.id) ?? 0
    return { id: o.id, label: o.option_label, votes: n, pct: total > 0 ? Math.round((n / total) * 100) : 0 }
  }).sort((a, b) => b.votes - a.votes)

  return { options, totalVotes: total, userVote }
}

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { groupId } = await params
  return NextResponse.json(await tally(createAdminClient(), groupId, user.id))
}

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { groupId } = await params

  const body = await request.json().catch(() => ({}))
  const optionId: string | undefined = body.option_market_id
  if (!optionId) return NextResponse.json({ error: 'Missing option' }, { status: 400 })

  const admin = createAdminClient()
  // The option must belong to this poll group and still be open.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: opt } = await (admin as any)
    .from('markets')
    .select('id, group_id, group_type, end_time, resolved')
    .eq('id', optionId)
    .maybeSingle()
  if (!opt || opt.group_id !== groupId || opt.group_type !== 'poll') {
    return NextResponse.json({ error: 'Invalid poll option' }, { status: 400 })
  }
  if (opt.resolved || new Date(opt.end_time) <= new Date()) {
    return NextResponse.json({ error: 'Poll is closed' }, { status: 400 })
  }

  // One vote per (group, user) — upsert flips an existing vote.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('poll_votes')
    .upsert({ group_id: groupId, user_id: user.id, option_market_id: optionId }, { onConflict: 'group_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(await tally(admin, groupId, user.id))
}
