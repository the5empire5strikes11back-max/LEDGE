-- ============================================================
-- Ledge full schema migration — safe to re-run
-- ============================================================

-- ── 1. Rename old bets columns if they exist ─────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bets' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE bets RENAME COLUMN profile_id TO user_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bets' AND column_name = 'choice'
  ) THEN
    ALTER TABLE bets RENAME COLUMN choice TO side;
  END IF;
END $$;

-- ── 2. profiles — new columns ────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_plus            BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS margin_debt        INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loss_streak        INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comeback_eligible  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_active_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW();

-- ── 3. markets — new columns ─────────────────────────────────

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS yes_pool               INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_pool                INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hot_score              INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS momentum_shift         INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured            BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_criteria    TEXT,
  ADD COLUMN IF NOT EXISTS resolution_source_url  TEXT,
  ADD COLUMN IF NOT EXISTS target_data_key        TEXT,
  ADD COLUMN IF NOT EXISTS circle_id              UUID;

-- Back-fill pools from existing total_credits
UPDATE markets
SET
  yes_pool = ROUND(total_credits * (yes_percent::NUMERIC / 100)),
  no_pool  = ROUND(total_credits * ((100 - yes_percent)::NUMERIC / 100))
WHERE yes_pool = 0 AND total_credits > 0;

-- ── 4. bets — payout column ──────────────────────────────────

ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS payout INTEGER;

-- ── 5. circles — invite_code ─────────────────────────────────

ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

UPDATE circles SET invite_code = SUBSTRING(gen_random_uuid()::TEXT, 1, 8) WHERE invite_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS circles_invite_code_idx ON circles(invite_code);

-- ── 6. push_subscriptions ────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'push_subscriptions' AND policyname = 'Users manage own subscriptions'
  ) THEN
    EXECUTE 'CREATE POLICY "Users manage own subscriptions" ON push_subscriptions FOR ALL USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ── 7. pnl_snapshots ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pnl_snapshots (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits    INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pnl_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pnl_snapshots' AND policyname = 'Users read own snapshots'
  ) THEN
    EXECUTE 'CREATE POLICY "Users read own snapshots" ON pnl_snapshots FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pnl_snapshots' AND policyname = 'Service role inserts snapshots'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role inserts snapshots" ON pnl_snapshots FOR INSERT WITH CHECK (true)';
  END IF;
END $$;

-- ── 8. daily_drops ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_drops (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount       INTEGER     NOT NULL DEFAULT 0,
  chest_tier   TEXT,
  chest_amount INTEGER     NOT NULL DEFAULT 0,
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE daily_drops ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_drops' AND policyname = 'Users manage own drops'
  ) THEN
    EXECUTE 'CREATE POLICY "Users manage own drops" ON daily_drops FOR ALL USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ── 9. Indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_markets_unresolved_expired
  ON markets(end_time) WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_bets_market_id     ON bets(market_id);
CREATE INDEX IF NOT EXISTS idx_bets_user_id       ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_user ON pnl_snapshots(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_drops_user   ON daily_drops(user_id, claimed_at DESC);

-- ── 10. Realtime ──────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE markets;
