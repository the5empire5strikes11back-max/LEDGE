# Ledge — Ops Runbook

## Go / No-Go Checklist

Before opening to real users, every item below must be ✅.

### Environment
- [ ] All env vars set in Vercel dashboard — verify at `/api/health`
- [ ] `CRON_SECRET` is a random 32-byte hex string (not "ledge_cron_2024")
- [ ] `ANTHROPIC_API_KEY` is valid and has credits
- [ ] Supabase RLS policies are enabled on all tables
- [ ] `rate_limits` table exists in Supabase (run `supabase/rate-limits-migration.sql`)

### Cron Jobs (Vercel Dashboard → Settings → Cron Jobs)
- [ ] `refresh-markets` — 06:00 UTC daily
- [ ] `release-markets` — 14:00 UTC daily  
- [ ] `snapshot-pnl` — 00:00 UTC daily

### Security
- [ ] `/api/markets/[id]/resolve` returns 403 to unauthenticated and non-admin requests ✓
- [ ] All cron endpoints require `Authorization: Bearer <CRON_SECRET>` ✓
- [ ] Sentry DSN is configured and receiving events (test via `/sentry-example-page`)

### Functional Smoke Test
1. Sign up with a new account → verify profile created, 1000 CR starting balance
2. Place a bet → verify credits deducted, market moves to Profile > Bets Made
3. Daily drop → verify credits awarded, streak increments
4. Create a circle → verify invite code works for second account

---

## System Overview

| Subsystem | How it works | Failure mode |
|-----------|-------------|--------------|
| Market generation | Cron runs at 06:00 UTC, fetches RSS feeds, calls Claude Haiku to generate markets, scores them, inserts as `queued` | If Anthropic API is down, generation fails with 500. Feed still shows existing markets. Set `DISABLE_MARKET_GENERATION=true` as kill switch. |
| Market release | Cron at 14:00 UTC + soft-trigger on every feed load (rate-limited to 2h). Moves `queued` → `live`, enforces category floors | If DB errors, current live markets remain. No user impact. |
| Resolution | Called on every feed load + cron. Direct HTTP first, Claude Haiku fallback, majority vote final fallback | If all resolution fails for a market, it stays unresolved. Set `DISABLE_RESOLUTION=true` as kill switch. |
| Daily drop | User-triggered on app open. Checks `daily_drops` table for today's claim | If table is missing or DB errors, drop silently skips (user gets no credits that day) |
| Push notifications | Fire-and-forget, non-blocking. Skips if VAPID keys not configured | Silent no-op if unconfigured. Non-410 errors logged to Sentry. |

---

## Monitoring

### Health check
```
GET /api/health
```
Returns 200 when healthy, 503 when degraded. Check: database, all env vars, kill switch states.

### Feed health
```
GET /api/markets/queue-health
Authorization: Bearer <CRON_SECRET>
```
Returns live/queued counts by category, starvation warnings, Sports inventory status.

### Sentry
All production errors go to Sentry (DSN: in `.env.local`/Vercel env).
Critical paths with explicit Sentry logging:
- `cron:refresh-markets` — generation failures, insert failures
- `resolve-expired` — per-market resolution failures
- `bets:POST` — bet placement failures
- `push:deliverOne` — non-410 push delivery failures

---

## Kill Switches

Set in Vercel dashboard under **Settings → Environment Variables** — no deploy needed.

| Variable | Value | Effect |
|----------|-------|--------|
| `DISABLE_MARKET_GENERATION` | `true` | Stops AI market generation cron. Existing markets still serve. |
| `DISABLE_RESOLUTION` | `true` | Stops automated resolution. Markets stay open. Use for manual review. |

To re-enable: delete the variable from Vercel or set to `false` and redeploy.

---

## Manual Resolution (Admin)

To manually resolve a market:
```bash
curl -X POST https://ledge-phi.vercel.app/api/markets/<MARKET_ID>/resolve \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"winner": "yes"}'
```
- Requires `CRON_SECRET` header
- Logs to Sentry and console
- Sends push notifications to all bettors
- Returns `{ resolved: true, payouts: N, results: [...] }`

---

## First-Week Launch Playbook

### Day 0 (launch day)
- Verify `/api/health` returns 200 ✅
- Check Sentry dashboard is receiving events
- Check Vercel function logs for any 500s
- Manually trigger `/api/markets/resolve-expired` and `/api/cron/release-markets` once

### Daily checks (Days 1–7)
1. Open `/api/markets/queue-health` — verify `live_total > 10` and no `emergency_warnings`
2. Check Sentry for new error spikes (especially `resolve-expired`, `bets:POST`)
3. Check Vercel cron execution logs — confirm 06:00 and 14:00 UTC jobs ran
4. Check Supabase dashboard → Table Editor → `bets` — verify bets are landing

### If something breaks

**Feed empty / no markets**
1. Check `/api/markets/queue-health` — if `queued_total = 0`, trigger `refresh-markets` manually
2. If generation keeps failing, check Anthropic API status + credits
3. Set `DISABLE_MARKET_GENERATION=true`, seed manually via `/api/markets/bulk-seed` (with `CRON_SECRET` auth)

**Markets not resolving**
1. Check Sentry for `resolve-expired` errors
2. If resolution is wrong (wrong winner), set `DISABLE_RESOLUTION=true` immediately
3. Manually resolve each affected market via the admin endpoint above
4. Investigate resolution logic before re-enabling

**Bets not being placed**
1. Check Sentry for `bets:POST` errors  
2. Check Supabase → `rate_limits` table exists and is not full
3. Check RLS policies on `bets` table

**Push notifications not working**
1. Check Sentry for `push:deliverOne` errors
2. Verify `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set in Vercel env
3. Push is non-critical — app functions without it

---

## Supabase Migrations Still Needed

Run these SQL files in Supabase SQL Editor before launch:

1. `supabase/rate-limits-migration.sql` — creates `rate_limits` table for rate limiting

---

## Key URLs

| URL | Purpose |
|-----|---------|
| `https://ledge-phi.vercel.app` | Production app |
| `https://ledge-phi.vercel.app/api/health` | Health check |
| Vercel Dashboard | Cron logs, function logs, env vars |
| Supabase Dashboard | DB tables, RLS policies, auth users |
| Sentry Dashboard | Error tracking |
