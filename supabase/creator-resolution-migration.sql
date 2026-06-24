-- Creator Resolution with trust balance.
--
-- Subjective markets (no source/AI can verify) can be set to resolution_mode
-- 'creator': the creator proposes the outcome at close, held through a dispute
-- window, then settled — unless bettors dispute past a threshold, in which case
-- it voids + refunds. Objective ('auto') markets are unchanged. Reputation
-- counters are recorded but not yet gated on. Idempotent.

ALTER TABLE markets ADD COLUMN IF NOT EXISTS resolution_mode         text NOT NULL DEFAULT 'auto';
ALTER TABLE markets ADD COLUMN IF NOT EXISTS creator_proposed_winner text;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS creator_resolved_at     timestamptz;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS markets_resolved int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS disputes_upheld  int NOT NULL DEFAULT 0;

-- The market_disputes table already exists (critical-features-migration.sql) with
-- (id, market_id, user_id, reason, created_at) and UNIQUE(market_id, user_id).
-- Creator-window disputes reuse it as-is — no schema change needed here.
