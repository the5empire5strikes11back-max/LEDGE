-- AMM Phase 2: Auto-bet (resting triggers / limit orders, reframed).
--
-- A user arms "buy {side} for me if it drops to {target}%". Credits are escrowed
-- at arm time (deducted from the profile) and refunded on cancel/expiry. When a
-- market's price crosses the target, the trigger fires via the CPMM and becomes a
-- normal bet. One live trigger per user per market.

CREATE TABLE IF NOT EXISTS auto_bets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  market_id      uuid NOT NULL REFERENCES markets(id)  ON DELETE CASCADE,
  side           text NOT NULL CHECK (side IN ('yes','no')),
  target_percent int  NOT NULL CHECK (target_percent BETWEEN 1 AND 99),
  amount         int  NOT NULL CHECK (amount > 0),
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','filled','cancelled','expired')),
  filled_bet_id  uuid REFERENCES bets(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  filled_at      timestamptz
);

-- At most one pending trigger per user per market.
CREATE UNIQUE INDEX IF NOT EXISTS auto_bets_one_pending
  ON auto_bets(user_id, market_id) WHERE status = 'pending';
-- Fast lookup of a market's resting triggers when its price moves.
CREATE INDEX IF NOT EXISTS auto_bets_market_pending
  ON auto_bets(market_id) WHERE status = 'pending';

-- All access goes through the service-role API; lock out direct anon/auth access.
ALTER TABLE auto_bets ENABLE ROW LEVEL SECURITY;
