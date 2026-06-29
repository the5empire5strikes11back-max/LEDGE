-- Calibration: store the probability of the user's side at bet time.
-- Used to compute Brier-score calibration. Null for bets before this migration.
ALTER TABLE bets ADD COLUMN IF NOT EXISTS bet_price numeric CHECK (bet_price >= 0 AND bet_price <= 1);
