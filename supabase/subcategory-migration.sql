-- ============================================================================
-- Custom category support  —  RUN ONCE in Supabase Dashboard → SQL Editor
-- ----------------------------------------------------------------------------
-- Adds a free-text `subcategory` label so users can coin their own category
-- when none of the six fit. The market still belongs to a real system category
-- (the create form sends "Wild"), so liquidity, floors, ranking, and the
-- category CHECK constraint are all unaffected — this column just carries the
-- label shown in place of the category on cards.
-- Safe to re-run.
-- ============================================================================

ALTER TABLE markets ADD COLUMN IF NOT EXISTS subcategory TEXT;
