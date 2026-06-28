-- Duolingo-style streak system.
--
-- last_streak_date: the user's local calendar day (YYYY-MM-DD) the streak last
--   advanced. The single source of truth for consecutive-day logic.
-- streak_freezes: real freeze inventory (0..FREEZE_CAP). Auto-consumed when a
--   day is missed; earned at 7-day milestones and buyable with credits.
-- The legacy streak_freeze_used_at column is left in place but no longer used.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_streak_date date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_freezes   int NOT NULL DEFAULT 0;
