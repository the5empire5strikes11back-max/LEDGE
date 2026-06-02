import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawBets, error } = await (supabase as any)
    .from('bets')
    .select('id, side, amount, created_at, profiles(username, avatar_url)')
    .eq('market_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bets = (rawBets ?? []) as Array<{
    id: string
    side: string
    amount: number
    created_at: string
    profiles: { username: string; avatar_url?: string | null } | null
  }>

  // Reconstruct probability history from sequential bets
  let yesPool = 0
  let noPool = 0
  const history = bets.map((b) => {
    if (b.side === 'yes') yesPool += b.amount
    else noPool += b.amount
    const total = yesPool + noPool
    return {
      timestamp: b.created_at,
      yesPercent: total > 0 ? Math.round((yesPool / total) * 1000) / 10 : 50,
    }
  })

  return NextResponse.json({
    bets: bets.map((b) => ({
      id: b.id,
      username: b.profiles?.username ?? 'anon',
      avatarUrl: b.profiles?.avatar_url ?? null,
      side: b.side,
      amount: b.amount,
      created_at: b.created_at,
    })),
    history,
  })
}
