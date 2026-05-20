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

  return NextResponse.json({ snapshotted: rows.length })
}
