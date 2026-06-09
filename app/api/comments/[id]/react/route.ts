import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { type?: string }
  if (!body.type || !['like', 'dislike'].includes(body.type)) {
    return NextResponse.json({ error: 'type must be like or dislike' }, { status: 400 })
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: rpcError } = await (admin as any).rpc('toggle_comment_reaction', {
    p_comment_id: id,
    p_user_id:    user.id,
    p_type:       body.type,
  })

  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comment } = await (supabase as any)
    .from('market_comments')
    .select('like_count, dislike_count')
    .eq('id', id)
    .single() as { data: { like_count: number; dislike_count: number } | null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reaction } = await (supabase as any)
    .from('comment_reactions')
    .select('type')
    .eq('comment_id', id)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { type: string } | null }

  return NextResponse.json({
    like_count:    comment?.like_count    ?? 0,
    dislike_count: comment?.dislike_count ?? 0,
    user_reaction: reaction?.type ?? null,
  })
}
