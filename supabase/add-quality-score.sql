-- ============================================================
-- Add quality_score column to markets table
-- Safe to re-run (uses IF NOT EXISTS)
--
-- quality_score: 1–100 (weighted_score × 10 from market-scorer.ts)
-- NULL = legacy market generated before scoring was introduced
-- ============================================================

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS quality_score SMALLINT DEFAULT NULL;

COMMENT ON COLUMN markets.quality_score IS
  'AI quality score 1–100. Computed by lib/market-scorer.ts at generation time. NULL = legacy market.';

-- Index for admin debug queries (rank markets by quality)
CREATE INDEX IF NOT EXISTS idx_markets_quality
  ON markets(quality_score DESC)
  WHERE quality_score IS NOT NULL;

-- Backfill legacy markets with neutral score 50
-- so they don't appear as NULL in queue-health / debug queries
UPDATE markets
  SET quality_score = 50
  WHERE quality_score IS NULL;
