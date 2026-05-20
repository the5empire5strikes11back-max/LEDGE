import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Profile missing (trigger failed) — create it now
  if (error && error.code === 'PGRST116') {
    const username = user.user_metadata?.username
      ?? user.email?.split('@')[0]
      ?? `user_${user.id.slice(0, 6)}`

    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .insert({ id: user.id, username })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    profile = newProfile
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(profile)
}

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const allowed = ['xp', 'credits', 'streak', 'rank', 'last_active_at'] as const
  type ProfileUpdate = import('@/types/database').Database['public']['Tables']['profiles']['Update']
  const updates = Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(([key]) => (allowed as readonly string[]).includes(key))
  ) as ProfileUpdate

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
