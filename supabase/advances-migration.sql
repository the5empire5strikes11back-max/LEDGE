-- AMM Phase 3: Daily Advance (loans, reframed).
--
-- A player advances a slice of their locked position value, tracked as debt and
-- skimmed back from winning payouts and cash-outs. Two columns on profiles:
-- the outstanding loan and the last claim time (for the once-a-day gate).
-- Idempotent.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS outstanding_advance int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_advance_at     timestamptz;
