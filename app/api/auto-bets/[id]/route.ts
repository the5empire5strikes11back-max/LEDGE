import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { refundTrigger } from '@/lib/auto-bet-trigger'
import { logError } from '@/lib/logger'

/** DELETE — cancel a pending auto-bet and refund its escrowed credits. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    // Owner + still-pending check before refunding (prevents double refund).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ab } = await (admin as any)
      .from('auto_bets')
      .select('id, user_id, amount, status')
      .eq('id', id)
      .maybeSingle()
    if (!ab || ab.user_id !== user.id) return NextResponse.json({ error: 'Auto-bet not found' }, { status: 404 })
    if (ab.status !== 'pending') return NextResponse.json({ error: 'Auto-bet already settled' }, { status: 409 })

    await refundTrigger(admin, ab.id, ab.user_id, ab.amount, 'cancelled')
    return NextResponse.json({ cancelled: true, refunded: ab.amount })
  } catch (err) {
    logError(err, { context: 'auto-bets:DELETE' })
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
