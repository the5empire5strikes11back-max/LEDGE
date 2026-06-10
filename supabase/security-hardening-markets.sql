-- ============================================================
-- Security hardening (part 2) — lock the markets table to server-only writes
-- Safe to re-run. Run AFTER deploying the matching code change
-- (POST /api/markets now inserts via the service-role client).
-- ============================================================
--
-- Why: markets_insert RLS only checks `auth.uid() = created_by`, not the column
-- values. The authenticated role had INSERT/UPDATE/DELETE on markets, so a user
-- could insert market rows directly via the browser anon client — bypassing the
-- server-side quality screening, category allowlist, rate limit, and trust
-- scoring in POST /api/markets (content/spam risk, not credit theft).
--
-- Fix: revoke direct write privileges. All market writes (user creation, cron
-- release/refresh, resolution, circle markets) go through server routes on the
-- service-role client, which BYPASSES these grants. SELECT stays intact.

REVOKE INSERT, UPDATE, DELETE ON public.markets FROM anon, authenticated;

-- Sanity check — should list only SELECT for anon/authenticated:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'markets' AND grantee IN ('anon','authenticated')
--   ORDER BY grantee, privilege_type;
