-- ============================================================
-- Security hardening — lock economic tables to server-only writes
-- Safe to re-run. Run AFTER deploying the matching code changes
-- (all credit/bet/daily-drop writes now use the service-role client).
-- ============================================================
--
-- Why: RLS WITH CHECK only validates row OWNERSHIP, not the VALUES being
-- written, and the `authenticated` role had table-level INSERT/UPDATE on the
-- economy tables. That allowed a logged-in user, straight from the browser
-- anon client, to:
--   • UPDATE their own profiles.credits / is_plus / xp / streak / rank
--   • INSERT a bet with a client-chosen `payout` (resolution trusts it)
--   • DELETE their daily_drops row and re-claim the daily credit drop forever
--
-- Fix: revoke direct write privileges from anon/authenticated on these tables.
-- All legitimate writes go through server routes using the service-role client,
-- which BYPASSES both RLS and these grants. SELECT is left intact so RLS-gated
-- reads (own bets, own drops, public profiles) keep working.

REVOKE INSERT, UPDATE, DELETE ON public.profiles    FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bets        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.daily_drops FROM anon, authenticated;

-- Sanity check — should list only SELECT for anon/authenticated on these tables:
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name IN ('profiles','bets','daily_drops')
--     AND grantee IN ('anon','authenticated')
--   ORDER BY table_name, grantee, privilege_type;
