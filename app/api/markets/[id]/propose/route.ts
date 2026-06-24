import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CREATOR_DISPUTE_HOURS } from '@/lib/creator-resolution'
import { logError } from '@/lib/logger'

/**
 * POST /api/markets/[id]/propose  { winner: 'yes'|'no' }
 *
 * The creator of a subjective (resolution_mode='creator') market proposes its
 * outcome at close. This does NOT settle — it records the proposal and opens the
 * dispute window; the resolve-expired cron settles (or voids on dispute) once the
 * window elapses. Only the creator, only after close, only once.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const winner = body?.winner as 'yes' | 'no' | undefined
    if (winner !== 'yes' && winner !== 'no') {
      return NextResponse.json({ error: 'winner must be "yes" or "no"' }, { status: 400 })
    }

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: market } = await (admin as any)
      .from('markets')
      .select('id, created_by, resolution_mode, resolved, end_time, creator_proposed_winner')
      .eq('id', id)
      .maybeSingle()
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    if (market.created_by !== user.id) return NextResponse.json({ error: 'Only the creator can resolve this market' }, { status: 403 })
    if (market.resolution_mode !== 'creator') return NextResponse.json({ error: 'This market resolves automatically' }, { status: 400 })
    if (market.resolved) return NextResponse.json({ error: 'Market already resolved' }, { status: 409 })
    if (new Date(market.end_time) > new Date()) return NextResponse.json({ error: 'Market is still open' }, { status: 400 })
    if (market.creator_proposed_winner) return NextResponse.json({ error: 'Outcome already proposed' }, { status: 409 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('markets')
      .update({ creator_proposed_winner: winner, creator_resolved_at: new Date().toISOString() })
      .eq('id', id)

    // Reputation: count that the creator proposed an outcome (not gated on yet).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (admin as any).from('profiles').select('markets_resolved').eq('id', user.id).single()
    if (prof) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from('profiles').update({ markets_resolved: (prof.markets_resolved ?? 0) + 1 }).eq('id', user.id)
    }

    return NextResponse.json({ proposed: winner, disputeWindowHours: CREATOR_DISPUTE_HOURS }, { status: 201 })
  } catch (err) {
    logError(err, { context: 'markets:propose' })
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
