-- ============================================================================
-- Follow system migration  —  RUN ONCE in Supabase Dashboard → SQL Editor
-- ----------------------------------------------------------------------------
-- Creates the user_follows table (the follow system was non-functional because
-- this table never existed) and adds the 'new_follower' notification type so
-- a follow generates a notification.
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

-- ── 1. user_follows table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS user_follows_follower_idx  ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS user_follows_following_idx ON user_follows(following_id);

ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'follows_select') THEN
    CREATE POLICY "follows_select" ON user_follows FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'follows_insert') THEN
    CREATE POLICY "follows_insert" ON user_follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_follows' AND policyname = 'follows_delete') THEN
    CREATE POLICY "follows_delete" ON user_follows FOR DELETE USING (auth.uid() = follower_id);
  END IF;
END $$;

-- ── 2. Allow the 'new_follower' notification type ───────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'market_resolved', 'odds_shift', 'streak_at_risk',
    'comment_reply', 'market_activity', 'new_follower'
  ));
