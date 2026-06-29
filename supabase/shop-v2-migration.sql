-- Shop v2: Safety Net tokens + Streak Repair support
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS safety_net_tokens int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pre_reset_streak  int NOT NULL DEFAULT 0;
