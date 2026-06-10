import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Server-side signup proxy — see ../login/route.ts for rationale.
 * Validates input, then calls Supabase signUp with the email-confirmation
 * redirect pointed back at /auth/callback on this origin.
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string; username?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = body.email?.trim()
  const password = body.password
  const username = body.username?.trim()

  if (!email || !password || !username) {
    return NextResponse.json({ error: 'Email, username and password are required' }, { status: 400 })
  }
  if (username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const origin = req.headers.get('origin') ?? new URL(req.url).origin
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
