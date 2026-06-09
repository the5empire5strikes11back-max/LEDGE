-- ── Critical features migration ──────────────────────────────────────────────
-- Adds: resolution metadata, dispute window, notification center

-- ── 1. Resolution metadata on markets ────────────────────────────────────────
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS resolved_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_note     TEXT,
  ADD COLUMN IF NOT EXISTS resolution_source_display TEXT;

-- ── 2. Market disputes table ──────────────────────────────────────────────────
-- Allows users to flag a market resolution as incorrect within 24h.
CREATE TABLE IF NOT EXISTS market_disputes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id  UUID        NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason     TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, user_id)   -- one dispute per user per market
);

CREATE INDEX IF NOT EXISTS market_disputes_market_id ON market_disputes(market_id);

ALTER TABLE market_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "disputes_select" ON market_disputes;
DROP POLICY IF EXISTS "disputes_insert" ON market_disputes;

CREATE POLICY "disputes_select" ON market_disputes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "disputes_insert" ON market_disputes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 3. Notifications table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN (
               'market_resolved', 'odds_shift', 'streak_at_risk',
               'comment_reply', 'market_activity'
             )),
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  url        TEXT,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created
  ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;

-- Users can read their own notifications
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can mark their own notifications as read
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
