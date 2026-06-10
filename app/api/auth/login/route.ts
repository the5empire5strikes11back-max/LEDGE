import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Server-side login proxy.
 *
 * Auth used to run browser → Supabase directly, which made app-level rate
 * limiting impossible. Routing it through here lets the edge middleware apply
 * the 5-attempts / 15-min per-IP limit, and the SSR client sets the session
 * cookies on the response so the browser is authenticated as before.
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = body.email?.trim()
  const password = body.password
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Supabase returns a generic "Invalid login credentials" — keep it as-is.
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
