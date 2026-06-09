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

-- comment_reports: insert own only
CREATE POLICY "reports_insert" ON comment_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ── Atomic reaction RPC ───────────────────────────────────────────────────────
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
    INSERT INTO comment_reactions (comment_id, user_id, type) VALUES (p_comment_id, p_user_id, p_type);
    IF p_type = 'like' THEN
      UPDATE market_comments SET like_count = like_count + 1 WHERE id = p_comment_id;
    ELSE
      UPDATE market_comments SET dislike_count = dislike_count + 1 WHERE id = p_comment_id;
    END IF;

  ELSIF existing_type = p_type THEN
    DELETE FROM comment_reactions WHERE comment_id = p_comment_id AND user_id = p_user_id;
    IF p_type = 'like' THEN
      UPDATE market_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = p_comment_id;
    ELSE
      UPDATE market_comments SET dislike_count = GREATEST(0, dislike_count - 1) WHERE id = p_comment_id;
    END IF;

  ELSE
    UPDATE comment_reactions SET type = p_type WHERE comment_id = p_comment_id AND user_id = p_user_id;
    IF p_type = 'like' THEN
      UPDATE market_comments SET like_count = like_count + 1, dislike_count = GREATEST(0, dislike_count - 1) WHERE id = p_comment_id;
    ELSE
      UPDATE market_comments SET dislike_count = dislike_count + 1, like_count = GREATEST(0, like_count - 1) WHERE id = p_comment_id;
    END IF;
  END IF;
END;
$$;
