-- Market groups: every market "type" is a group of binary YES/NO markets.
-- Each option of a Multiple Choice / Numeric / Date / Set market is one normal
-- market row sharing a group_id. Standalone Yes/No markets leave these null and
-- are completely unaffected.
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS group_id        uuid,
  ADD COLUMN IF NOT EXISTS group_label     text,    -- the parent question, e.g. "Who wins the World Cup?"
  ADD COLUMN IF NOT EXISTS option_label    text,    -- this option within the group, e.g. "France" / "25–49"
  ADD COLUMN IF NOT EXISTS group_type      text DEFAULT 'yes_no',  -- yes_no | multiple_choice | numeric | date | set
  ADD COLUMN IF NOT EXISTS group_exclusive boolean DEFAULT true;   -- true = exactly one wins; false (Set) = independent

CREATE INDEX IF NOT EXISTS markets_group_id_idx ON markets(group_id) WHERE group_id IS NOT NULL;
