import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/notifications
 * Returns the 30 most recent notifications for the authenticated user.
 * Also returns `unread_count`.
 *
 * PATCH /api/notifications
 * Body: { ids?: string[] }  — mark specific (or all) notifications as read.
 */

export async function GET() {
  const userClient = await import('@/lib/supabase/server').then((m) => m.createClient())
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notifications, error } = await (supabase as any)
    .from('notifications')
    .select('id, type, title, body, url, read, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unreadCount = (notifications ?? []).filter((n: { read: boolean }) => !n.read).length

  return NextResponse.json({ notifications: notifications ?? [], unread_count: unreadCount })
}

export async function PATCH(request: Request) {
  const userClient = await import('@/lib/supabase/server').then((m) => m.createClient())
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const ids: string[] | undefined = body.ids

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)

  if (ids?.length) {
    query = query.in('id', ids)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
