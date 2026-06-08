-- Add interest personalisation columns to profiles table
-- Run in Supabase SQL editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS interests text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false;

-- Optional index to speed up any future analytics queries on interests
CREATE INDEX IF NOT EXISTS idx_profiles_interests ON profiles USING gin (interests);
