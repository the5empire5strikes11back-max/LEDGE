-- Streak freeze column: tracks when the user last consumed a freeze
-- Run this in Supabase Dashboard → SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS streak_freeze_used_at TIMESTAMPTZ DEFAULT NULL;
