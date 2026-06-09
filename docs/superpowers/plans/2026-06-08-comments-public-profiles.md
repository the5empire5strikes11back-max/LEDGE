# Comments + Public Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add market comments (text + images, likes/dislikes, reports) and public profile sheets (viewable by tapping any username).

**Architecture:** New DB tables (`market_comments`, `comment_reactions`, `comment_reports`) + Supabase Storage bucket for comment images. Five new API routes. Two new React components (`MarketComments`, `PublicProfileSheet`). Comments slot into the bottom of `market-detail.tsx`; public profiles are a bottom sheet triggered globally from `app/page.tsx` by lifting `publicProfileUsername` state.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + Storage + RLS), Tailwind CSS, TypeScript, lucide-react

---

## File Map

**Create:**
- `app/api/comments/route.ts` — GET (list) + POST (create)
- `app/api/comments/[id]/route.ts` — DELETE (own comment)
- `app/api/comments/[id]/react/route.ts` — POST (like/dislike toggle)
- `app/api/comments/[id]/report/route.ts` — POST (flag comment)
- `app/api/comments/[id]/image/route.ts` — POST (upload image)
- `app/api/users/[username]/route.ts` — GET (public profile)
- `components/market-comments.tsx` — full comments UI
- `components/public-profile-sheet.tsx` — read-only profile bottom sheet
- `supabase/comments-migration.sql` — DB migration script

**Modify:**
- `components/market-detail.tsx` — add `<MarketComments>` below Recent Trades, accept `onUsernameClick` prop
- `app/page.tsx` — lift `publicProfileUsername` state, render `<PublicProfileSheet>`, pass `onUsernameClick` to `MarketDetail`

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/comments-migration.sql`

- [ ] **Step 1: Write migration SQL**

Create `supabase/comments-migration.sql`:

```sql
-- ── market_comments ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id     uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body          text NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 500),
  image_url     text,
  like_count    integer NOT NULL DEFAULT 0,
  dislike_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_comments_market_id_created_at
  ON market_comments (market_id, created_at DESC);

-- ── comment_reactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id  uuid NOT NULL REFERENCES market_comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('like', 'dislike')),
  PRIMARY KEY (comment_id, user_id)
);

-- ── comment_reports ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid NOT NULL REFERENCES market_comments(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reporter_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE market_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reports   ENABLE ROW LEVEL SECURITY;

-- market_comments: anyone can read, authenticated users can insert own, delete own
CREATE POLICY "comments_select" ON market_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON market_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete" ON market_comments FOR DELETE USING (auth.uid() = user_id);

-- comment_reactions: anyone can read, authenticated users can insert/update/delete own
CREATE POLICY "reactions_select" ON comment_reactions FOR SELECT USING (true);
CREATE POLICY "reactions_insert" ON comment_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions_update" ON comment_reactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "reactions_delete" ON comment_reactions FOR DELETE USING (auth.uid() = user_id);

-- comment_reports: insert own only (reporters cannot see others' reports)
CREATE POLICY "reports_insert" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ── Atomic reaction RPC ───────────────────────────────────────────────────────
-- Called by the react API route to update counts without race conditions
CREATE OR REPLACE FUNCTION toggle_comment_reaction(
  p_comment_id uuid,
  p_user_id    uuid,
  p_type       text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  existing_type text;
BEGIN
  SELECT type INTO existing_type
  FROM comment_reactions
  WHERE comment_id = p_comment_id AND user_id = p_user_id;

  IF existing_type IS NULL THEN
    -- No reaction: insert and increment
    INSERT INTO comment_reactions (comment_id, user_id, type) VALUES (p_comment_id, p_user_id, p_type);
    IF p_type = 'like' THEN
      UPDATE market_comments SET like_count = like_count + 1 WHERE id = p_comment_id;
    ELSE
      UPDATE market_comments SET dislike_count = dislike_count + 1 WHERE id = p_comment_id;
    END IF;

  ELSIF existing_type = p_type THEN
    -- Same reaction: toggle off
    DELETE FROM comment_reactions WHERE comment_id = p_comment_id AND user_id = p_user_id;
    IF p_type = 'like' THEN
      UPDATE market_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = p_comment_id;
    ELSE
      UPDATE market_comments SET dislike_count = GREATEST(0, dislike_count - 1) WHERE id = p_comment_id;
    END IF;

  ELSE
    -- Opposite reaction: switch
    UPDATE comment_reactions SET type = p_type WHERE comment_id = p_comment_id AND user_id = p_user_id;
    IF p_type = 'like' THEN
      UPDATE market_comments SET like_count = like_count + 1, dislike_count = GREATEST(0, dislike_count - 1) WHERE id = p_comment_id;
    ELSE
      UPDATE market_comments SET dislike_count = dislike_count + 1, like_count = GREATEST(0, like_count - 1) WHERE id = p_comment_id;
    END IF;
  END IF;
END;
$$;
```

- [ ] **Step 2: Run migration against Supabase**

```bash
# Option A — Supabase dashboard SQL editor: paste the file contents
# Option B — Supabase CLI (if linked):
npx supabase db push
# Or run directly:
npx supabase db execute --file supabase/comments-migration.sql
```

Verify tables exist:
```bash
curl -s "https://nlmczpvdmdvxgcgolror.supabase.co/rest/v1/market_comments?limit=0" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# Expected: [] (empty array, not 404)
```

- [ ] **Step 3: Create comment-images storage bucket**

```bash
# Run in Supabase SQL editor or via API:
# The API route will call createBucket idempotently — bucket auto-created on first upload.
# Manually create via dashboard: Storage > New Bucket > name: "comment-images" > Public: true
```

- [ ] **Step 4: Commit**

```bash
git add supabase/comments-migration.sql
git commit -m "feat: add comments DB tables, RLS, and reaction RPC"
```

---

## Task 2: GET + POST Comments API

**Files:**
- Create: `app/api/comments/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/comments/route.ts`:

```typescript
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

  const { data: comments, error } = await supabase
    .from('market_comments')
    .select(`
      id, body, image_url, like_count, dislike_count, created_at,
      profiles!market_comments_user_id_fkey (username, avatar_url),
      user_id
    `)
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch current user's reactions for these comments
  let userReactions: Record<string, string> = {}
  if (user && comments && comments.length > 0) {
    const commentIds = comments.map((c) => c.id)
    const { data: reactions } = await supabase
      .from('comment_reactions')
      .select('comment_id, type')
      .eq('user_id', user.id)
      .in('comment_id', commentIds)

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
      user_reaction: userReactions[c.id] ?? null,
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

  const { data: comment, error } = await supabase
    .from('market_comments')
    .insert({
      market_id: body.marketId,
      user_id:   user.id,
      body:      body.body.trim(),
      image_url: body.imageUrl ?? null,
    })
    .select('id, body, image_url, like_count, dislike_count, created_at, user_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch profile for response
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    ...comment,
    username:      profile?.username ?? 'unknown',
    avatar_url:    profile?.avatar_url ?? null,
    user_reaction: null,
    is_own:        true,
  }, { status: 201 })
}
```

- [ ] **Step 2: Test GET (no comments yet)**

```bash
curl "http://localhost:3000/api/comments?marketId=TEST_MARKET_ID"
# Expected: {"comments":[],"page":1,"hasMore":false}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/comments/route.ts
git commit -m "feat: add GET/POST /api/comments"
```

---

## Task 3: DELETE + React + Report + Image APIs

**Files:**
- Create: `app/api/comments/[id]/route.ts`
- Create: `app/api/comments/[id]/react/route.ts`
- Create: `app/api/comments/[id]/report/route.ts`
- Create: `app/api/comments/[id]/image/route.ts`

- [ ] **Step 1: Create DELETE route**

Create `app/api/comments/[id]/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch first to get image_url for cleanup
  const { data: comment } = await supabase
    .from('market_comments')
    .select('user_id, image_url')
    .eq('id', id)
    .single()

  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (comment.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('market_comments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clean up image from storage if present
  if (comment.image_url) {
    const adminClient = (await import('@/lib/supabase/server')).createAdminClient()
    const url  = new URL(comment.image_url)
    const path = url.pathname.split('/comment-images/')[1]
    if (path) {
      await adminClient.storage.from('comment-images').remove([path]).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create react route**

Create `app/api/comments/[id]/react/route.ts`:

```typescript
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

  // Return updated counts + user's current reaction
  const { data: comment } = await supabase
    .from('market_comments')
    .select('like_count, dislike_count')
    .eq('id', id)
    .single()

  const { data: reaction } = await supabase
    .from('comment_reactions')
    .select('type')
    .eq('comment_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    like_count:    comment?.like_count    ?? 0,
    dislike_count: comment?.dislike_count ?? 0,
    user_reaction: reaction?.type ?? null,
  })
}
```

- [ ] **Step 3: Create report route**

Create `app/api/comments/[id]/report/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { reason?: string }

  const { error } = await supabase.from('comment_reports').insert({
    comment_id:  id,
    reporter_id: user.id,
    reason:      body.reason ?? null,
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already reported' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Create image upload route**

Create `app/api/comments/[id]/image/route.ts`:

```typescript
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const BUCKET   = 'comment-images'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file)                                 return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!file.type.startsWith('image/'))       return NextResponse.json({ error: 'Must be an image' }, { status: 400 })
  if (file.size > MAX_BYTES)                 return NextResponse.json({ error: 'Max 5 MB' }, { status: 400 })

  const admin  = createAdminClient()
  await admin.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const ext    = file.type.split('/')[1] ?? 'jpg'
  const path   = `${user.id}/${id}.${ext}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ imageUrl: publicUrl })
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/comments/
git commit -m "feat: add DELETE, react, report, image upload API routes for comments"
```

---

## Task 4: Public User Profile API

**Files:**
- Create: `app/api/users/[username]/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/users/[username]/route.ts`:

```typescript
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeAchievements } from '@/lib/achievements'
import { computePersona, rankFromXP } from '@/lib/game-engine'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  const admin = createAdminClient()

  // Fetch profile (public fields only)
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, username, avatar_url, xp, streak, is_plus, created_at')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Fetch resolved bets for stats + achievements
  const { data: rawBets } = await admin
    .from('bets')
    .select('won, amount, side, created_at, markets(title, category, resolved)')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: true })

  const bets = (rawBets ?? []) as Array<{
    won: boolean | null
    amount: number
    side: string
    created_at: string
    markets: { title: string; category: string; resolved: boolean } | null
  }>

  const resolvedBets = bets.filter((b) => b.won !== null)
  const wonBets      = resolvedBets.filter((b) => b.won).length
  const winRate      = resolvedBets.length > 0 ? Math.round((wonBets / resolvedBets.length) * 100) : 0

  // Best streak
  let bestStreak = 0
  let current    = 0
  for (const bet of resolvedBets) {
    if (bet.won) { current++; bestStreak = Math.max(bestStreak, current) }
    else { current = 0 }
  }

  // Achievements
  const achievementBets = bets.map((b) => ({
    won:      b.won,
    amount:   b.amount,
    category: b.markets?.category ?? 'Sports',
  }))
  const achievements = computeAchievements(achievementBets)

  // Persona
  const personaBets = bets.map((b) => ({
    won:      b.won,
    side:     b.side as 'yes' | 'no',
    category: b.markets?.category ?? 'Sports',
  }))
  const persona = computePersona(personaBets)

  // Last 5 resolved bets
  const recentBets = bets
    .filter((b) => b.won !== null && b.markets)
    .slice(-5)
    .reverse()
    .map((b) => ({
      market_title: b.markets!.title,
      side:         b.side,
      won:          b.won,
      created_at:   b.created_at,
    }))

  const rank = rankFromXP(profile.xp)

  return NextResponse.json({
    username:    profile.username,
    avatar_url:  profile.avatar_url,
    rank,
    xp:          profile.xp,
    streak:      profile.streak,
    is_plus:     profile.is_plus,
    created_at:  profile.created_at,
    win_rate:    winRate,
    total_bets:  bets.length,
    best_streak: bestStreak,
    persona,
    achievements,
    recent_bets: recentBets,
  })
}
```

- [ ] **Step 2: Test the route**

```bash
curl "http://localhost:3000/api/users/mr_mercenary"
# Expected: JSON with username, rank, win_rate, achievements[], etc.
```

- [ ] **Step 3: Commit**

```bash
git add app/api/users/
git commit -m "feat: add GET /api/users/[username] public profile endpoint"
```

---

## Task 5: MarketComments Component

**Files:**
- Create: `components/market-comments.tsx`

- [ ] **Step 1: Create the component**

Create `components/market-comments.tsx`:

```tsx
"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ThumbsUp, ThumbsDown, Flag, Trash2, ImagePlus, X, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/ui/user-avatar"

interface Comment {
  id: string
  user_id: string
  username: string
  avatar_url: string | null
  body: string
  image_url: string | null
  like_count: number
  dislike_count: number
  created_at: string
  user_reaction: 'like' | 'dislike' | null
  is_own: boolean
}

interface MarketCommentsProps {
  marketId: string
  currentUsername?: string | null
  currentAvatarUrl?: string | null
  onUsernameClick?: (username: string) => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function MarketComments({
  marketId,
  currentUsername,
  currentAvatarUrl,
  onUsernameClick,
}: MarketCommentsProps) {
  const [comments, setComments]       = useState<Comment[]>([])
  const [loading, setLoading]         = useState(true)
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(false)
  const [body, setBody]               = useState("")
  const [imageFile, setImageFile]     = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting]   = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [menuOpen, setMenuOpen]       = useState<string | null>(null)
  const fileInputRef                  = useRef<HTMLInputElement>(null)

  const fetchComments = useCallback(async (p: number, replace: boolean) => {
    setLoading(p === 1)
    const res  = await fetch(`/api/comments?marketId=${marketId}&page=${p}`)
    const data = await res.json() as { comments: Comment[]; hasMore: boolean }
    setComments((prev) => replace ? data.comments : [...prev, ...data.comments])
    setHasMore(data.hasMore)
    setLoading(false)
  }, [marketId])

  useEffect(() => { fetchComments(1, true) }, [fetchComments])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert("Max 5 MB"); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async () => {
    if (!body.trim() && !imageFile) return
    setSubmitting(true)

    try {
      let imageUrl: string | null = null

      if (imageFile) {
        // Create a temporary comment id placeholder for storage path
        const tempId = crypto.randomUUID()
        const fd = new FormData()
        fd.append("file", imageFile)
        const imgRes  = await fetch(`/api/comments/${tempId}/image`, { method: "POST", body: fd })
        const imgData = await imgRes.json() as { imageUrl?: string; error?: string }
        if (!imgRes.ok) { alert(imgData.error ?? "Image upload failed"); return }
        imageUrl = imgData.imageUrl ?? null
      }

      const res  = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, body: body.trim() || " ", imageUrl }),
      })
      const data = await res.json() as Comment & { error?: string }
      if (!res.ok) { alert(data.error ?? "Failed to post"); return }

      setComments((prev) => [data, ...prev])
      setBody("")
      removeImage()
    } finally {
      setSubmitting(false)
    }
  }

  const handleReact = async (commentId: string, type: 'like' | 'dislike') => {
    // Optimistic update
    setComments((prev) => prev.map((c) => {
      if (c.id !== commentId) return c
      const wasActive = c.user_reaction === type
      return {
        ...c,
        like_count:    type === 'like'    ? (wasActive ? c.like_count - 1    : c.like_count    + 1) : (c.user_reaction === 'like'    ? c.like_count    - 1 : c.like_count),
        dislike_count: type === 'dislike' ? (wasActive ? c.dislike_count - 1 : c.dislike_count + 1) : (c.user_reaction === 'dislike' ? c.dislike_count - 1 : c.dislike_count),
        user_reaction: wasActive ? null : type,
      }
    }))

    const res = await fetch(`/api/comments/${commentId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    })
    if (!res.ok) {
      // Revert on error
      fetchComments(1, true)
    }
  }

  const handleDelete = async (commentId: string) => {
    setMenuOpen(null)
    if (!confirm("Delete this comment?")) return
    await fetch(`/api/comments/${commentId}`, { method: "DELETE" })
    setComments((prev) => prev.filter((c) => c.id !== commentId))
  }

  const handleReport = async (commentId: string) => {
    setMenuOpen(null)
    const res = await fetch(`/api/comments/${commentId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "user_report" }),
    })
    if (res.status === 409) { alert("Already reported"); return }
    alert("Comment reported. Thanks.")
  }

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    fetchComments(next, false)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-accent rounded-full" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          Takes ({comments.length}{hasMore ? "+" : ""})
        </span>
      </div>

      {/* Comment input */}
      {currentUsername ? (
        <div className="border border-border bg-surface" style={{ borderRadius: "var(--radius-card)" }}>
          {imagePreview && (
            <div className="relative px-3 pt-3">
              <img
                src={imagePreview}
                alt="preview"
                className="w-full max-h-40 object-cover"
                style={{ borderRadius: "var(--radius-button)" }}
              />
              <button
                onClick={removeImage}
                className="absolute top-4 right-4 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <UserAvatar username={currentUsername} avatarUrl={currentAvatarUrl} size={26} className="shrink-0" />
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
              placeholder="Add a take…"
              maxLength={500}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Attach image"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || (!body.trim() && !imageFile)}
              className="text-accent disabled:text-muted-foreground/30 transition-colors shrink-0"
            >
              {submitting
                ? <span className="w-4 h-4 border border-accent border-t-transparent rounded-full animate-spin inline-block" />
                : <Send className="w-4 h-4" />
              }
            </button>
          </div>
        </div>
      ) : (
        <div
          className="px-4 py-3 text-center border border-border bg-surface text-xs text-muted-foreground"
          style={{ borderRadius: "var(--radius-card)" }}
        >
          Sign in to join the discussion.
        </div>
      )}

      {/* Comment list */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1,2,3].map((i) => (
            <div key={i} className="h-16 bg-surface border border-border animate-pulse" style={{ borderRadius: "var(--radius-card)" }} />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div
          className="px-4 py-5 text-center bg-surface border border-border"
          style={{ borderRadius: "var(--radius-card)" }}
        >
          <p className="text-xs text-muted-foreground">No takes yet. Be first.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border border border-border overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}>
          {comments.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-2 px-3 py-3 bg-surface">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserAvatar username={comment.username} avatarUrl={comment.avatar_url} size={22} className="shrink-0" />
                  <button
                    onClick={() => onUsernameClick?.(comment.username)}
                    className="text-xs font-medium text-foreground hover:text-accent transition-colors"
                  >
                    @{comment.username}
                  </button>
                  <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
                </div>
                {/* Context menu */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === comment.id ? null : comment.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors px-1"
                  >
                    <span className="text-xs">•••</span>
                  </button>
                  {menuOpen === comment.id && (
                    <div
                      className="absolute right-0 top-5 z-10 min-w-[120px] bg-surface-2 border border-border shadow-lg py-1"
                      style={{ borderRadius: "var(--radius-card)" }}
                    >
                      {comment.is_own ? (
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReport(comment.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                        >
                          <Flag className="w-3 h-3" /> Report
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Body */}
              {comment.body.trim() && (
                <p className="text-sm text-foreground leading-relaxed">{comment.body}</p>
              )}

              {/* Image */}
              {comment.image_url && (
                <button onClick={() => setLightboxUrl(comment.image_url)} className="text-left">
                  <img
                    src={comment.image_url}
                    alt="comment image"
                    className="w-full max-h-48 object-cover"
                    style={{ borderRadius: "var(--radius-button)" }}
                  />
                </button>
              )}

              {/* Reactions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleReact(comment.id, 'like')}
                  className={cn(
                    "flex items-center gap-1 text-[11px] transition-colors",
                    comment.user_reaction === 'like' ? "text-success" : "text-muted-foreground hover:text-success"
                  )}
                >
                  <ThumbsUp className="w-3 h-3" />
                  {comment.like_count > 0 && <span>{comment.like_count}</span>}
                </button>
                <button
                  onClick={() => handleReact(comment.id, 'dislike')}
                  className={cn(
                    "flex items-center gap-1 text-[11px] transition-colors",
                    comment.user_reaction === 'dislike' ? "text-danger" : "text-muted-foreground hover:text-danger"
                  )}
                >
                  <ThumbsDown className="w-3 h-3" />
                  {comment.dislike_count > 0 && <span>{comment.dislike_count}</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={loadMore}
          className="text-xs text-accent hover:text-accent/80 transition-colors py-1 text-center"
        >
          Load more
        </button>
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt="full size"
            className="max-w-full max-h-full object-contain"
            style={{ borderRadius: "var(--radius-card)" }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      )}

      {/* Close context menu on outside click */}
      {menuOpen && (
        <div className="fixed inset-0 z-[5]" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/market-comments.tsx
git commit -m "feat: add MarketComments component with image upload, likes, reports"
```

---

## Task 6: PublicProfileSheet Component

**Files:**
- Create: `components/public-profile-sheet.tsx`

- [ ] **Step 1: Create the component**

Create `components/public-profile-sheet.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { X, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/ui/user-avatar"
import { AchievementsGrid } from "@/components/achievements-grid"
import { RANKS } from "@/components/user-profile-card"
import { xpProgress } from "@/lib/game-engine"
import type { Achievement } from "@/lib/achievements"
import type { Persona, RankKey } from "@/lib/game-engine"

interface PublicProfile {
  username:    string
  avatar_url:  string | null
  rank:        RankKey
  xp:          number
  streak:      number
  is_plus:     boolean
  win_rate:    number
  total_bets:  number
  best_streak: number
  persona:     Persona
  achievements: Achievement[]
  recent_bets: Array<{
    market_title: string
    side:         string
    won:          boolean | null
    created_at:   string
  }>
}

interface PublicProfileSheetProps {
  username: string | null
  onClose:  () => void
}

export function PublicProfileSheet({ username, onClose }: PublicProfileSheetProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!username) { setProfile(null); return }
    setLoading(true)
    setError(null)
    fetch(`/api/users/${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((data: PublicProfile & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setProfile(data)
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false))
  }, [username])

  if (!username) return null

  const rankInfo = profile ? RANKS[profile.rank] : null
  const progress = profile ? xpProgress(profile.xp) : null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface-2 border-t border-border max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300"
        style={{ borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-8">
          {loading && (
            <div className="flex flex-col gap-3 pt-4">
              <div className="h-16 bg-surface animate-pulse" style={{ borderRadius: "var(--radius-card)" }} />
              <div className="h-12 bg-surface animate-pulse" style={{ borderRadius: "var(--radius-card)" }} />
              <div className="h-32 bg-surface animate-pulse" style={{ borderRadius: "var(--radius-card)" }} />
            </div>
          )}

          {error && (
            <div className="py-8 text-center text-sm text-muted-foreground">{error}</div>
          )}

          {profile && rankInfo && progress && (
            <div className="flex flex-col gap-4 pt-3">
              {/* Header */}
              <div className="flex items-center gap-3">
                <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} size={52} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground">@{profile.username}</span>
                    {profile.is_plus && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 bg-accent/15 text-accent border border-accent/30 uppercase tracking-wider"
                        style={{ borderRadius: "var(--radius-badge)" }}
                      >
                        PLUS
                      </span>
                    )}
                    {profile.streak > 0 && (
                      <span className="text-xs text-accent font-mono">🔥 {profile.streak}</span>
                    )}
                  </div>
                  {/* Rank + XP bar */}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-semibold" style={{ color: rankInfo.color }}>
                      {rankInfo.label}
                    </span>
                    <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress.percent}%`, backgroundColor: rankInfo.color }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {progress.current}/{progress.required} XP
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Win Rate",   value: `${profile.win_rate}%` },
                  { label: "Total Bets", value: String(profile.total_bets) },
                  { label: "Best Streak",value: String(profile.best_streak) },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1 px-3 py-2.5 bg-surface border border-border"
                    style={{ borderRadius: "var(--radius-card)" }}
                  >
                    <span className="font-mono text-base font-bold text-foreground">{value}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                  </div>
                ))}
              </div>

              {/* Persona */}
              <div
                className="flex items-center gap-3 px-3 py-3 bg-surface border border-border"
                style={{ borderRadius: "var(--radius-card)" }}
              >
                <span className="text-2xl shrink-0">{profile.persona.emoji}</span>
                <div>
                  <p className="text-xs font-bold text-foreground">{profile.persona.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{profile.persona.description}</p>
                </div>
                <Zap className="w-3.5 h-3.5 text-accent ml-auto shrink-0" />
              </div>

              {/* Achievements */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                  Achievements
                </p>
                <AchievementsGrid earned={profile.achievements} />
              </div>

              {/* Recent bets */}
              {profile.recent_bets.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                    Recent Calls
                  </p>
                  <div
                    className="flex flex-col divide-y divide-border border border-border overflow-hidden"
                    style={{ borderRadius: "var(--radius-card)" }}
                  >
                    {profile.recent_bets.map((bet, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-surface">
                        <p className="text-xs text-foreground truncate flex-1 mr-3">{bet.market_title}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-1.5 py-0.5",
                              bet.side === 'yes' ? "text-success bg-success/10" : "text-danger bg-danger/10"
                            )}
                            style={{ borderRadius: "var(--radius-badge)" }}
                          >
                            {bet.side.toUpperCase()}
                          </span>
                          {bet.won !== null && (
                            <span className={cn("text-[10px] font-bold", bet.won ? "text-success" : "text-danger")}>
                              {bet.won ? "W" : "L"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/public-profile-sheet.tsx
git commit -m "feat: add PublicProfileSheet component"
```

---

## Task 7: Wire Comments Into MarketDetail

**Files:**
- Modify: `components/market-detail.tsx`

- [ ] **Step 1: Add imports and prop**

In `components/market-detail.tsx`, add to imports:

```tsx
import { MarketComments } from "@/components/market-comments"
```

Add `onUsernameClick` to the `MarketDetailProps` interface:

```tsx
interface MarketDetailProps {
  // ... existing props ...
  onUsernameClick?: (username: string) => void
  currentUsername?: string | null
  currentAvatarUrl?: string | null
}
```

Update the function signature to destructure the new props:

```tsx
export function MarketDetail({
  market,
  onClose,
  onBuyYes,
  onBuyNo,
  mode = "overlay",
  onUsernameClick,
  currentUsername,
  currentAvatarUrl,
}: MarketDetailProps) {
```

- [ ] **Step 2: Make bet activity usernames tappable**

In the Recent Trades section (around line 473), find:

```tsx
<span className="text-xs text-foreground font-medium truncate">@{bet.username}</span>
```

Replace with:

```tsx
<button
  onClick={() => onUsernameClick?.(bet.username)}
  className="text-xs text-foreground font-medium truncate hover:text-accent transition-colors"
>
  @{bet.username}
</button>
```

- [ ] **Step 3: Add comments section after Recent Trades**

After the closing `</div>` of the Recent Trades section (after `{/* Recent trades */}` block ends, before `</div>` that closes the main scroll area), add:

```tsx
{/* Comments */}
<div className="mt-2">
  <MarketComments
    marketId={market.id}
    currentUsername={currentUsername}
    currentAvatarUrl={currentAvatarUrl}
    onUsernameClick={onUsernameClick}
  />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add components/market-detail.tsx
git commit -m "feat: add comments section and tappable usernames to MarketDetail"
```

---

## Task 8: Wire PublicProfileSheet Into app/page.tsx

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add imports**

Add to imports at top of `app/page.tsx`:

```tsx
import { PublicProfileSheet } from "@/components/public-profile-sheet"
```

- [ ] **Step 2: Add state**

After the existing state declarations (near the top of the component), add:

```tsx
const [publicProfileUsername, setPublicProfileUsername] = useState<string | null>(null)
```

- [ ] **Step 3: Pass callback and props to MarketDetail**

Find where `<MarketDetail>` is rendered (search for `<MarketDetail market=`). Add the new props:

```tsx
<MarketDetail
  market={selectedMarket}
  onClose={() => setSelectedMarket(null)}
  onBuyYes={() => { /* existing */ }}
  onBuyNo={() => { /* existing */ }}
  onUsernameClick={(username) => setPublicProfileUsername(username)}
  currentUsername={profile?.username ?? null}
  currentAvatarUrl={profile?.avatar_url ?? null}
/>
```

- [ ] **Step 4: Render PublicProfileSheet at root**

Before the final closing `</div>` of the page return, add:

```tsx
{/* Public profile sheet */}
<PublicProfileSheet
  username={publicProfileUsername}
  onClose={() => setPublicProfileUsername(null)}
/>
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire PublicProfileSheet globally from app/page.tsx"
```

---

## Task 9: Fix Import — RankKey and Persona types

**Files:**
- Modify: `components/public-profile-sheet.tsx`
- Modify: `app/api/users/[username]/route.ts`

- [ ] **Step 1: Verify RankKey export location**

```bash
grep -n "export type RankKey\|export.*RankKey" /Users/sebastianjimenez/ledge/components/user-profile-card.tsx /Users/sebastianjimenez/ledge/lib/game-engine.ts
```

`RankKey` is exported from `@/components/user-profile-card`. `Persona` is exported from `@/lib/game-engine`. Both are already correct in the component files. `computePersona` and `rankFromXP` are in `@/lib/game-engine`. Verify:

```bash
grep -n "export function computePersona\|export function rankFromXP" /Users/sebastianjimenez/ledge/lib/game-engine.ts
```

If `computePersona` is not exported, add `export` keyword to it in `lib/game-engine.ts`.

- [ ] **Step 2: Fix any missing exports**

In `lib/game-engine.ts`, ensure these are exported:
- `computePersona` (add `export` if missing)
- `rankFromXP` (should already be exported)
- `Persona` type (add `export` if missing)

- [ ] **Step 3: Commit if changes made**

```bash
git add lib/game-engine.ts
git commit -m "fix: export computePersona and Persona type from game-engine"
```

---

## Task 10: Build Check + Deploy

- [ ] **Step 1: Run TypeScript check**

```bash
cd /Users/sebastianjimenez/ledge && npx tsc --noEmit 2>&1 | head -50
```

Fix any type errors before proceeding.

- [ ] **Step 2: Run dev server and smoke test**

```bash
npm run dev
# Open http://localhost:3000
# 1. Open any market → scroll down → verify comments section appears
# 2. Post a comment → verify it appears instantly
# 3. Like/dislike → verify counts update
# 4. Attach image → post → verify thumbnail shows, lightbox opens on tap
# 5. Report a comment → verify toast
# 6. Tap a username in Recent Trades or comments → verify PublicProfileSheet opens
# 7. Verify profile sheet shows rank, stats, achievements, recent bets
```

- [ ] **Step 3: Deploy**

```bash
npx vercel --prod
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: market comments + public profiles — images, likes, dislikes, reports"
git push
```
