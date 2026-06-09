-- ── Expand category CHECK constraint ─────────────────────────────────────────
-- Drops the old 4-value constraint and replaces it with the expanded 7-value set.

ALTER TABLE markets
  DROP CONSTRAINT IF EXISTS markets_category_check;

ALTER TABLE markets
  ADD CONSTRAINT markets_category_check
  CHECK (category IN ('Sports', 'Politics', 'Culture', 'Tech', 'Viral', 'Wild', 'Circle'));

-- Update liquidity migration defaults for new categories
-- (run only if you have a virtual_yes_pool / virtual_no_pool column)
-- These are already handled in code via seedLiquidity() — no SQL needed.
