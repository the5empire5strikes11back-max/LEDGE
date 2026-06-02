import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { invite_code } = body as { invite_code?: string }

  if (!invite_code?.trim()) {
    return NextResponse.json({ error: 'Invite code is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const code = invite_code.trim().toUpperCase()

  // Case-insensitive lookup — stored codes are uppercase but be defensive
  const { data: circle, error: findError } = await supabase
    .from('circles')
    .select('id, name, invite_code')
    .ilike('invite_code', code)
    .maybeSingle()

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
  if (!circle) return NextResponse.json({ error: 'Invalid invite code — check and try again' }, { status: 404 })

  // Already a member?
  const { data: existing } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', circle.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: `You're already in "${circle.name}"` }, { status: 409 })
  }

  const { error: joinError } = await supabase
    .from('circle_members')
    .insert({ circle_id: circle.id, user_id: user.id })

  if (joinError) return NextResponse.json({ error: joinError.message }, { status: 500 })

  return NextResponse.json({ circle }, { status: 201 })
}
