-- Follow system migration
-- Run in Supabase Dashboard → SQL Editor

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

-- Anyone authenticated can read follow relationships (for counts + is_following)
CREATE POLICY "follows_select" ON user_follows
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only insert their own follows
CREATE POLICY "follows_insert" ON user_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Users can only delete their own follows
CREATE POLICY "follows_delete" ON user_follows
  FOR DELETE USING (auth.uid() = follower_id);
