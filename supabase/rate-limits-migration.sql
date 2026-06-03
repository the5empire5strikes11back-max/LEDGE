-- ============================================================
-- Rate Limits table — safe to re-run
-- Tracks per-user request counts per endpoint for server-side
-- rate limiting without any external Redis dependency.
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        NOT NULL,   -- "{userId}:{endpoint}"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast window lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_time
  ON rate_limits(key, created_at DESC);

-- Service role can insert/read (app uses admin client)
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rate_limits' AND policyname = 'Service role manages rate limits'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role manages rate limits" ON rate_limits FOR ALL USING (true)';
  END IF;
END $$;

-- Auto-cleanup: delete rows older than 1 hour so the table stays small.
-- Run this once in Supabase SQL editor to schedule via pg_cron (optional).
-- SELECT cron.schedule('cleanup-rate-limits', '*/30 * * * *',
--   $$DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL '1 hour'$$);
