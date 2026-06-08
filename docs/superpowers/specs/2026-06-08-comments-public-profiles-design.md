# Design: Market Comments + Public Profiles

**Date:** 2026-06-08  
**Status:** Approved

---

## Overview

Two social features built together:
1. **Market Comments** — users can post text + images under any market, like/dislike comments, and report inappropriate content.
2. **Public Profiles** — tapping any username anywhere in the app opens a read-only bottom sheet with that user's stats, rank, achievements, and persona.

---

## Database Schema

### `market_comments`
```sql
CREATE TABLE market_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id    uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) <= 500),
  image_url    text,
  like_count   integer NOT NULL DEFAULT 0,
  dislike_count integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON market_comments (market_id, created_at DESC);
```

### `comment_reactions`
```sql
CREATE TABLE comment_reactions (
  comment_id  uuid NOT NULL REFERENCES market_comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('like', 'dislike')),
  PRIMARY KEY (comment_id, user_id)
);
```
One row per user per comment. Switching from like→dislike replaces the row and adjusts counts atomically.

### `comment_reports`
```sql
CREATE TABLE comment_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid NOT NULL REFERENCES market_comments(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, reporter_id)
);
```
Soft moderation — flagged comments are not auto-deleted. One report per user per comment.

### Row-Level Security
- `market_comments`: SELECT all, INSERT own, DELETE own only.
- `comment_reactions`: SELECT all, INSERT/UPDATE/DELETE own only.
- `comment_reports`: INSERT own only (reporters cannot see others' reports).

### Supabase Storage
New public bucket: `comment-images`. Path pattern: `{userId}/{commentId}.{ext}`. Max object size: 5MB. Client compresses to ≤1MB / ≤1200px before upload.

---

## API Routes

### `GET /api/comments?marketId={id}&page={n}`
- Returns 20 comments per page, newest first.
- Each comment includes: `id`, `user_id`, `username`, `avatar_url`, `body`, `image_url`, `like_count`, `dislike_count`, `created_at`, `user_reaction` (current user's reaction type or null).
- Auth optional — unauthenticated users see counts but `user_reaction` is null.

### `POST /api/comments`
- Body: `{ marketId, body, imageUrl? }`
- Validates body length ≤ 500 chars.
- Returns created comment row.
- Rate limit: 10 comments per minute per user.

### `DELETE /api/comments/[id]`
- Auth required. User must own the comment.
- Hard deletes the row (image_url file is also deleted from storage).

### `POST /api/comments/[id]/react`
- Body: `{ type: 'like' | 'dislike' }`
- If no existing reaction: insert row, increment count.
- If same reaction: delete row, decrement count (toggle off).
- If opposite reaction: update row type, decrement old count, increment new count.
- All count mutations via Supabase RPC function for atomicity.
- Returns updated `{ like_count, dislike_count, user_reaction }`.

### `POST /api/comments/[id]/report`
- Body: `{ reason?: string }`
- Inserts into `comment_reports`. Duplicate reports (same user) return 409.
- Returns 200 on success. No email/notification in v1.

### `GET /api/users/[username]`
- Returns public profile data: `username`, `avatar_url`, `rank`, `xp`, `streak`, `is_plus`, `created_at`.
- Joins computed stats: `win_rate`, `total_bets`, `best_streak`, `persona`.
- Returns earned achievements array (same logic as `/api/stats`).
- Returns last 5 resolved bets with market title, side, outcome.
- Does NOT return: `credits`, PnL history, `margin_debt`, email.

### `POST /api/comments/[id]/image`
- Accepts multipart form with image file.
- Uploads to Supabase Storage `comment-images` bucket.
- Returns `{ imageUrl }`.

---

## Frontend Components

### `components/market-comments.tsx` (new)
Self-contained comments section rendered inside `market-detail.tsx` below the bet activity feed.

**Structure:**
- `CommentList` — virtualized list of `CommentRow` items, paginated with "Load more" button.
- `CommentRow` — avatar (tappable → public profile), username, timestamp, body, optional image thumbnail (tap → lightbox), like/dislike buttons with counts, `•••` context menu (delete own / report others).
- `CommentInput` — fixed at bottom of section: avatar + text input (placeholder "Add a take…") + image attach icon + send button. Disabled when not authenticated.
- Image lightbox: full-screen overlay with close button.

**State:**
- Comments fetched on mount, refetched after post.
- Optimistic updates for reactions (revert on error).
- Image upload shows preview before submit; upload happens on send.

### `components/public-profile-sheet.tsx` (new)
Bottom sheet triggered by tapping any username in the app.

**Props:** `{ username: string; open: boolean; onClose: () => void }`

**Content (read-only):**
- Header: avatar, username, rank badge with XP bar, streak flame + count, Ledge+ badge if applicable.
- Stats row: Win Rate · Total Bets · Best Streak.
- Prediction Persona card (emoji + label + description).
- Achievements grid — earned achievements only, same `AchievementsGrid` component.
- Recent bets: last 5 resolved bets, each showing market title, YES/NO side, win/loss outcome chip.

**Data:** fetched from `GET /api/users/[username]` on open. Loading skeleton while fetching.

### Changes to existing components

**`market-detail.tsx`:**
- Import and render `<MarketComments marketId={market.id} />` below the bet activity section.
- Pass `onUsernameClick` callback to activity feed and comments to open `PublicProfileSheet`.

**`market-feed-card.tsx`, `leaderboard-row.tsx`, `market-social-bar.tsx`, `daily-drop-modal.tsx`:**
- Wrap displayed usernames in a tappable element that calls `onUsernameClick(username)`.
- `app/page.tsx` lifts `publicProfileTarget` state and renders `<PublicProfileSheet>` at the root level.

---

## Data Flow

```
User taps username anywhere
  → sets publicProfileTarget state in app/page.tsx
  → PublicProfileSheet opens, fetches GET /api/users/[username]
  → renders public data

User opens market detail
  → MarketComments mounts, fetches GET /api/comments?marketId=X
  → renders CommentList

User posts comment
  → optional: POST /api/comments/[id]/image → get imageUrl
  → POST /api/comments with { marketId, body, imageUrl }
  → comment prepended to list optimistically

User taps like/dislike
  → optimistic update to counts + user_reaction
  → POST /api/comments/[id]/react
  → on error: revert

User reports comment
  → POST /api/comments/[id]/report
  → toast: "Comment reported"
```

---

## Error Handling

- Post fails (rate limit / server error): toast error, input text preserved.
- Image too large (>5MB): client-side error before upload attempt.
- Image upload fails: comment submit blocked, error shown inline.
- Report duplicate (409): toast "Already reported".
- Public profile not found (404): sheet shows "User not found" state.

---

## Out of Scope (v1)

- Admin moderation dashboard for reported comments.
- Comment threading / replies.
- Notifications for reactions on your comments.
- Blocking users.
- Comment search.
