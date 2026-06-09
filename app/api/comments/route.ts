import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

const PAGE_SIZE = 20

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const marketId = searchParams.get('marketId')
  const page     = parseInt(searchParams.get('page') ?? '1', 10)

  if (!marketId) return NextResponse.json({ error: 'marketId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comments, error } = await (supabase as any)
    .from('market_comments')
    .select('id, body, image_url, like_count, dislike_count, created_at, user_id, profiles(username, avatar_url)')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .range(from, to) as {
      data: Array<{
        id: string; body: string; image_url: string | null; like_count: number;
        dislike_count: number; created_at: string; user_id: string;
        profiles: { username: string; avatar_url: string | null } | null
      }> | null
      error: { message: string } | null
    }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch current user's reactions for these comments
  let userReactions: Record<string, string> = {}
  if (user && comments && comments.length > 0) {
    const commentIds = comments.map((c) => c.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reactions } = await (supabase as any)
      .from('comment_reactions')
      .select('comment_id, type')
      .eq('user_id', user.id)
      .in('comment_id', commentIds) as { data: Array<{ comment_id: string; type: string }> | null }

    if (reactions) {
      userReactions = Object.fromEntries(reactions.map((r) => [r.comment_id, r.type]))
    }
  }

  const result = (comments ?? []).map((c) => {
    const profile = c.profiles as { username: string; avatar_url: string | null } | null
    return {
      id:            c.id,
      user_id:       c.user_id,
      username:      profile?.username ?? 'unknown',
      avatar_url:    profile?.avatar_url ?? null,
      body:          c.body,
      image_url:     c.image_url,
      like_count:    c.like_count,
      dislike_count: c.dislike_count,
      created_at:    c.created_at,
      user_reaction: (userReactions[c.id] ?? null) as 'like' | 'dislike' | null,
      is_own:        user ? c.user_id === user.id : false,
    }
  })

  return NextResponse.json({ comments: result, page, hasMore: result.length === PAGE_SIZE })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, { key: `${user.id}:comments`, limit: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many comments. Slow down.' }, { status: 429 })
  }

  const body = await request.json() as { marketId?: string; body?: string; imageUrl?: string }

  if (!body.marketId || typeof body.marketId !== 'string') {
    return NextResponse.json({ error: 'marketId required' }, { status: 400 })
  }
  if (!body.body || typeof body.body !== 'string' || body.body.trim().length === 0) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }
  if (body.body.length > 500) {
    return NextResponse.json({ error: 'Comment too long (max 500 chars)' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comment, error } = await (supabase as any)
    .from('market_comments')
    .insert({
      market_id: body.marketId,
      user_id:   user.id,
      body:      body.body.trim(),
      image_url: body.imageUrl ?? null,
    })
    .select('id, body, image_url, like_count, dislike_count, created_at, user_id')
    .single() as { data: { id: string; body: string; image_url: string | null; like_count: number; dislike_count: number; created_at: string; user_id: string } | null; error: { message: string } | null }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single() as { data: { username: string; avatar_url: string | null } | null }

  return NextResponse.json({
    ...comment,
    username:      profile?.username ?? 'unknown',
    avatar_url:    profile?.avatar_url ?? null,
    user_reaction: null,
    is_own:        true,
  }, { status: 201 })
}
