-- Polls: a question with options people vote on (not bet on). One vote per user
-- per poll; changing your vote updates the row. Poll options are markets rows
-- with group_type='poll'; the votes live here.
CREATE TABLE IF NOT EXISTS poll_votes (
  group_id         uuid NOT NULL,
  option_market_id uuid NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS poll_votes_group_idx ON poll_votes(group_id);
CREATE INDEX IF NOT EXISTS poll_votes_option_idx ON poll_votes(option_market_id);
-- All access goes through the service-role API; lock out direct anon/auth access.
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
