# Creator Resolution with Trust Balance — Design

**Date:** 2026-06-21
**Status:** Approved (design direction), pending spec review

## Problem

Ledge resolves every market automatically: trusted source → Claude AI fallback →
void + refund. Creators have zero say. This wins on "tamper-proof on anything
checkable" — our differentiator vs Manifold — but it has a real gap: genuinely
**subjective** markets ("Was the party fun?", "Did our group trip happen?") have
no source and no public fact for AI to verify, so they always void. The market
was pointless.

Goal: give creators resolution flexibility **only where it adds value** (subjective
markets), without weakening the tamper-proof guarantee on objective markets.

## Core Principle

> Flexibility where it helps, trust where it counts.

- **Objective markets** (a source or AI can verify) → unchanged. Auto-resolved.
  Creator is locked out. This path is byte-for-byte identical to today.
- **Subjective markets** → creator proposes the outcome at close, disclosed to
  bettors up front, protected by a dispute window whose worst case is a refund —
  never a theft.

## Resolution Modes

A new column `markets.resolution_mode`: `'auto'` (default) | `'creator'`.

- `auto` — current pipeline. Creator never sees a resolve control.
- `creator` — set at creation for subjective markets. Creator resolves at close.

**How a market becomes `creator` mode:** the creator chooses it explicitly in the
create sheet ("How will this be settled?"). Default is `auto`. AI-generated
markets are always `auto`. Choosing `creator` is safe to allow freely because:
(1) the mode is disclosed via a badge before anyone bets, and (2) abuse is capped
at a refund by the dispute window. Polls are unaffected (votes, not bets).

## Lifecycle of a Creator-Resolved Market

```
created (resolution_mode='creator')
   │
   │  badge: "👤 Creator-resolved" shown everywhere
   ▼
end_time passes  ──► creator proposes winner via POST /api/markets/[id]/resolve
   │                    sets creator_proposed_winner + creator_resolved_at
   │                    (NOT settled yet — payouts held)
   │                    increments profiles.markets_resolved
   ▼
24h dispute window (CREATOR_DISPUTE_HOURS)
   │  bettors may flag via POST /api/markets/[id]/dispute
   ▼
window elapses  ──► resolve-expired cron evaluates:
        disputes below threshold  ──► settle on creator_proposed_winner
        disputes at/over threshold ──► VOID + refund (existing voidBets path)
                                        increments creator's disputes_upheld
```

### Guardrails

1. **Dispute threshold.** Void if disputes ≥ `max(MIN_DISPUTES, ceil(DISPUTE_FRACTION × uniqueBettors))`.
   Constants: `MIN_DISPUTES = 2`, `DISPUTE_FRACTION = 0.3`. A bettor may dispute
   once (PK on `market_id, user_id`). The creator cannot dispute their own market.

2. **Self-bet conflict of interest.** If the creator also placed a bet on this
   market, the bar drops to **any single dispute voids it**. Removes the obvious
   "resolve in my own favor" attack.

3. **Abandonment fallback.** If a `creator` market closes and the creator never
   proposes a winner within `CREATOR_RESOLVE_DEADLINE_HOURS = 48`, it falls
   through to void + refund. Markets never hang forever.

4. **Worst case is always a refund.** No code path lets a creator's call pay out
   over the objection of the crowd. The downside ceiling is "nobody wins," never
   "creator steals the pot."

## Reputation (record now, gate later — YAGNI)

Two counters on `profiles`: `markets_resolved` (creator proposed an outcome) and
`disputes_upheld` (their proposal was overturned by a dispute). Recorded so the
data exists; **not** used to gate anything yet. A trust badge on the profile can
come later once there's signal.

## Components

### Schema (`supabase/creator-resolution-migration.sql`)
- `markets.resolution_mode text NOT NULL DEFAULT 'auto'`
- `markets.creator_proposed_winner text` (`'yes'|'no'|null`)
- `markets.creator_resolved_at timestamptz`
- `profiles.markets_resolved int NOT NULL DEFAULT 0`
- `profiles.disputes_upheld int NOT NULL DEFAULT 0`
- New table `market_disputes (market_id uuid, user_id uuid, created_at timestamptz,
  PRIMARY KEY (market_id, user_id))`, RLS enabled (all access via service role).

### API
- `POST /api/markets/[id]/resolve` — creator-only; market must be `creator` mode,
  closed, unresolved, not yet proposed. Body `{ winner: 'yes'|'no' }`. Sets the
  proposed winner + timestamp, bumps `markets_resolved`. Does **not** settle.
- `POST /api/markets/[id]/dispute` — bettor-only (must hold a bet, not be the
  creator); market must be creator-proposed and inside the window. Upserts a
  dispute row. Returns `{ disputes, threshold, willVoid }`.

### Resolution cron (`app/api/markets/resolve-expired/route.ts`)
Add a branch **before** the auto pipeline, for `resolution_mode='creator'`:
- Not yet proposed + within deadline → pending (wait for creator).
- Not yet proposed + past `CREATOR_RESOLVE_DEADLINE_HOURS` → void + refund.
- Proposed + within dispute window → pending (wait out the window).
- Proposed + window elapsed → evaluate disputes → settle (`settleBets`) or void
  (`voidBets` + bump `disputes_upheld`). Reuses existing helpers untouched.

### UI
- **create-market-sheet** — resolution-mode selector (🛡️ Auto / 👤 I'll resolve).
  Default Auto. Hidden for Poll.
- **Badge** — "🛡️ Source-verified" vs "👤 Creator-resolved" on cards + detail,
  shown before betting. Reuses the existing resolution chip area.
- **Creator resolve control** — appears on the creator's own closed `creator`
  market (market detail / profile): "Settle this market" → YES / NO.
- **Dispute control** — for bettors during the window: "Doesn't look right? Flag"
  → confirms, shows current flag count.

## Error Handling
- All economic writes via `createAdminClient()` (service role), as today.
- `resolve` rejects non-creators (403), wrong mode (400), already proposed (409).
- `dispute` rejects non-bettors (403), the creator (403), out-of-window (400),
  duplicate (idempotent — upsert, returns current count).
- Resolution cron wraps each market in try/catch and continues on failure (today's
  pattern), so one bad creator market never blocks the batch.

## Testing
- Unit: dispute-threshold math (`MIN_DISPUTES` / `DISPUTE_FRACTION`, self-bet drop
  to 1), abandonment deadline, mode classification.
- Integration: resolve → no settlement until window; dispute past threshold → void;
  below threshold → settle; self-bet + 1 dispute → void; abandoned → void.
- Manual: create a creator market, close it, resolve, confirm hold → settle/void.

## Out of Scope (YAGNI)
- Gating market creation or resolution on reputation.
- Public trust scores / badges on profiles.
- Partial / N-way creator resolution for grouped markets (creator mode is binary
  YES/NO only in v1; grouped subjective markets stay auto/void).
- Appeals beyond the single dispute window.
