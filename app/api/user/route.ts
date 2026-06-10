import { createClient, createAdminClient } from '@/lib/supabase/server'
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

    // Use the service-role client: direct profile writes are revoked for the
    // authenticated role to prevent credit/xp self-grants. Identity is still
    // pinned to the verified session (user.id), so this can only create the
    // caller's own profile.
    const admin = createAdminClient()
    const { data: newProfile, error: insertError } = await admin
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

// NOTE: A PATCH handler used to live here that accepted client-supplied
// `credits`, `xp`, `streak`, and `rank` and wrote them to the caller's own
// profile. That let any authenticated user mint unlimited credits and rank.
// It was unused by the client and has been removed. All credit/XP/streak
// changes are computed and written server-side (bets, daily-drop, resolve)
// using the service-role client. Do not reintroduce client-writable economy
// fields.
