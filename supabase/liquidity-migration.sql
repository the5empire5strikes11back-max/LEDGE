-- ============================================================
-- Market Liquidity System — safe to re-run
-- Run this in your Supabase SQL editor
-- ============================================================

-- ── 1. Add virtual pool columns to markets ──────────────────────────────────

ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS virtual_yes_pool  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS virtual_no_pool   BIGINT NOT NULL DEFAULT 0;

-- ── 2. Back-fill existing open markets with virtual liquidity ──────────────
-- Sports: 18K, Culture: 12K, Politics: 8K, Circle markets: 4K
-- Featured markets get an extra 6K boost on both sides

UPDATE markets
SET
  virtual_yes_pool = CASE
    WHEN resolved = false AND category = 'Sports'   THEN CASE WHEN is_featured THEN 24000 ELSE 18000 END
    WHEN resolved = false AND category = 'Culture'  THEN CASE WHEN is_featured THEN 18000 ELSE 12000 END
    WHEN resolved = false AND category = 'Politics' THEN CASE WHEN is_featured THEN 14000 ELSE  8000 END
    WHEN resolved = false AND category = 'Circle'   THEN CASE WHEN is_featured THEN 10000 ELSE  4000 END
    ELSE 0
  END,
  virtual_no_pool = CASE
    WHEN resolved = false AND category = 'Sports'   THEN CASE WHEN is_featured THEN 24000 ELSE 18000 END
    WHEN resolved = false AND category = 'Culture'  THEN CASE WHEN is_featured THEN 18000 ELSE 12000 END
    WHEN resolved = false AND category = 'Politics' THEN CASE WHEN is_featured THEN 14000 ELSE  8000 END
    WHEN resolved = false AND category = 'Circle'   THEN CASE WHEN is_featured THEN 10000 ELSE  4000 END
    ELSE 0
  END
WHERE virtual_yes_pool = 0;

-- ── 3. Re-compute yes_percent for open markets using effective pools ──────────
-- Decay formula: exp(−hot_score × ln(2) / 20), floored at 0.05
-- effective_yes = yes_pool + virtual_yes_pool × decay
-- yes_percent   = effective_yes / (effective_yes + effective_no) × 100

UPDATE markets
SET yes_percent = ROUND(
  (
    (yes_pool + ROUND(virtual_yes_pool * GREATEST(0.05, EXP(-hot_score * LN(2) / 20.0))))::NUMERIC /
    NULLIF(
      (yes_pool + ROUND(virtual_yes_pool * GREATEST(0.05, EXP(-hot_score * LN(2) / 20.0)))) +
      (no_pool  + ROUND(virtual_no_pool  * GREATEST(0.05, EXP(-hot_score * LN(2) / 20.0)))),
      0
    )
  ) * 100,
  1
)
WHERE resolved = false
  AND (virtual_yes_pool > 0 OR virtual_no_pool > 0);

-- ── 4. Index for liquidity queries ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_markets_virtual_pools
  ON markets(virtual_yes_pool, virtual_no_pool)
  WHERE resolved = false;

-- ── 5. Verification query ─────────────────────────────────────────────────────
-- Run to confirm results:

SELECT
  category,
  COUNT(*)                              AS market_count,
  AVG(virtual_yes_pool)::INT            AS avg_virtual_pool,
  AVG(yes_percent)::NUMERIC(5,1)        AS avg_yes_pct,
  MIN(yes_percent)::NUMERIC(5,1)        AS min_yes_pct,
  MAX(yes_percent)::NUMERIC(5,1)        AS max_yes_pct
FROM markets
WHERE resolved = false
GROUP BY category
ORDER BY avg_virtual_pool DESC;
