import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const maxDuration = 60

// Runs nightly at midnight — inserts one credit snapshot per active user.
// Vercel cron schedule: "0 0 * * *"
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, credits')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!profiles?.length) return NextResponse.json({ snapshotted: 0 })

  const rows = profiles.map((p) => ({ user_id: p.id, credits: p.credits }))

  // Bulk insert — one round-trip regardless of user count
  const { error: insertError } = await supabase
    .from('pnl_snapshots')
    .insert(rows)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Housekeeping: prune rate-limit rows older than 1h. The per-IP proxy limiter
  // writes a row per /api request, so this keeps that table bounded. The longest
  // rate-limit window is 15min, so anything past 1h is safe to delete.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('rate_limits')
    .delete()
    .lt('created_at', new Date(Date.now() - 60 * 60_000).toISOString())

  return NextResponse.json({ snapshotted: rows.length })
}
