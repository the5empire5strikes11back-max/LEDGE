import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Returns the last 30 daily credit snapshots for the current user.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('pnl_snapshots')
    .select('credits, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
