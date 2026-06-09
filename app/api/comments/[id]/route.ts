import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comment } = await (supabase as any)
    .from('market_comments')
    .select('user_id, image_url')
    .eq('id', id)
    .single() as { data: { user_id: string; image_url: string | null } | null }

  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (comment.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('market_comments').delete().eq('id', id) as { error: { message: string } | null }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clean up image from storage if present
  if (comment.image_url) {
    try {
      const adminClient = createAdminClient()
      const url  = new URL(comment.image_url)
      const path = url.pathname.split('/comment-images/')[1]
      if (path) {
        await adminClient.storage.from('comment-images').remove([path])
      }
    } catch {
      // Image cleanup failure is non-fatal
    }
  }

  return NextResponse.json({ ok: true })
}
