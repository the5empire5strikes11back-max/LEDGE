-- ============================================================
-- Add quality_score column to markets table
-- Safe to re-run (uses IF NOT EXISTS / DO blocks)
-- ============================================================

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS quality_score INTEGER;

-- Optional: index for surfacing high-quality open markets first
CREATE INDEX IF NOT EXISTS idx_markets_quality
  ON markets(quality_score DESC)
  WHERE resolved = false AND quality_score IS NOT NULL;

-- Backfill existing markets with a neutral score of 50
-- so they don't appear as NULL in queries
UPDATE markets
  SET quality_score = 50
  WHERE quality_score IS NULL;
