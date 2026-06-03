-- ============================================================
-- Ledge — status / queue schema migration
-- Run once in the Supabase SQL editor to enable the queue system.
-- Safe to re-run (all statements use IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- 1. Add queue / lifecycle columns to markets
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS status       TEXT        NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 2. Mark all existing (pre-migration) markets as live so they keep showing
UPDATE markets SET status = 'live' WHERE status IS DISTINCT FROM 'live';

-- 3. Indexes for fast status + resolved queries
CREATE INDEX IF NOT EXISTS idx_markets_status          ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_status_resolved ON markets(status, resolved);
CREATE INDEX IF NOT EXISTS idx_markets_generated_at    ON markets(generated_at) WHERE status = 'queued';
