-- Credit Shop v1: consumable boosts bought with earned credits.
-- double_down_tokens: each one doubles a single bet's payout (consumed on use).
-- xp_boost_until: 2x XP while now() < this timestamp.
-- (streak_freezes already exists from the streak system migration.)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS double_down_tokens int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp_boost_until     timestamptz;
