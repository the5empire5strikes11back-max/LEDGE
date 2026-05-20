import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { invite_code } = body as { invite_code?: string }

  if (!invite_code?.trim()) {
    return NextResponse.json({ error: 'Invite code is required' }, { status: 400 })
  }

  // Find circle by invite code
  const { data: circle, error: findError } = await supabase
    .from('circles')
    .select('id, name')
    .eq('invite_code', invite_code.trim().toUpperCase())
    .single()

  if (findError || !circle) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  }

  // Check if already a member
  const { data: existing } = await supabase
    .from('circle_members')
    .select('circle_id')
    .eq('circle_id', circle.id)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Already a member of this circle' }, { status: 409 })
  }

  const { error: joinError } = await supabase
    .from('circle_members')
    .insert({ circle_id: circle.id, user_id: user.id })

  if (joinError) {
    return NextResponse.json({ error: joinError.message }, { status: 500 })
  }

  return NextResponse.json({ circle }, { status: 201 })
}
