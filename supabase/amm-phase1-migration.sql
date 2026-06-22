-- AMM Phase 1: share-based CPMM reserves.
--
-- markets gain live reserves (yes_shares, no_shares); bets gain the share count
-- held. Reserves are backfilled so the CURRENT odds (yes_percent) are preserved
-- exactly, at a depth derived from existing liquidity + volume. Legacy bets'
-- locked payout already equals their share count, so bets.shares backfills from
-- payout. Fully idempotent.

ALTER TABLE markets ADD COLUMN IF NOT EXISTS yes_shares numeric;
ALTER TABLE markets ADD COLUMN IF NOT EXISTS no_shares  numeric;
ALTER TABLE bets    ADD COLUMN IF NOT EXISTS shares     numeric;

-- Backfill market reserves from current state. p = yes_percent/100 (default 0.5);
-- depth D = virtual pools + real volume, floored to a sane minimum so brand-new
-- markets still get usable depth. n = D·p, y = D·(1−p)  ⇒  priceYes = n/(y+n) = p.
UPDATE markets
SET
  no_shares  = GREATEST(1, COALESCE(virtual_yes_pool,0) + COALESCE(virtual_no_pool,0) + COALESCE(total_credits,0), 6000)
               * (COALESCE(yes_percent,50) / 100.0),
  yes_shares = GREATEST(1, COALESCE(virtual_yes_pool,0) + COALESCE(virtual_no_pool,0) + COALESCE(total_credits,0), 6000)
               * (1 - COALESCE(yes_percent,50) / 100.0)
WHERE yes_shares IS NULL OR no_shares IS NULL;

-- Legacy bets: locked payout was the max win = share count. Open bets without a
-- payout fall back to their stake.
UPDATE bets
SET shares = COALESCE(payout, amount)
WHERE shares IS NULL;
