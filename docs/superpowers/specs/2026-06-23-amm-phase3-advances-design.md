# AMM Phase 3 — Advances (loans, reframed)

**Date:** 2026-06-23
**Status:** Approved (full delegation)

## Goal

Let players pull a slice of the value locked in their open positions back out —
once a day — so capital isn't frozen in long-running markets. Manifold's daily
loan, reframed as "🏦 Daily Advance." Final phase of the AMM roadmap; builds on
the Phase 1 CPMM (`sellShares` values positions) and is independent of Phase 2.

## Anti-minting core (the design's whole point)

A naive "X% of position value, free" mints credits: take the advance, let the
position lose, keep the cash. So an advance is a **loan** tracked as
`outstanding_advance` debt, **skimmed off the top of every payout and cash-out**
until repaid.

- **Borrowing capacity** = `floor(ADVANCE_RATE × liveValue) − outstanding`.
- **Claim** (once per calendar day) = `min(capacity, DAILY_MAX)`, allowed only if
  it clears `MIN_CLAIM`.
- **Repayment:** before crediting a user on a winning settlement or a cash-out,
  skim `min(outstanding, proceeds)` to pay the debt down; credit only the net.
- Outstanding reduces future capacity, so a player can't re-borrow indefinitely
  against the same locked value — self-limiting. Worst-case leakage (positions
  lose, debt never repaid) is bounded by the daily cap and is no worse than the
  daily free-credit drop the app already gives, so the economy stays sane.

## Constants

`ADVANCE_RATE = 0.15`, `DAILY_MAX = 2000`, `MIN_CLAIM = 100`. Interest-free.
Once per calendar day (UTC date change). Loss shortfalls are **forgiven** (debt
clamped at ≥0, balance never goes negative) — play money, bounded leakage.

## Components

### Schema (`supabase/advances-migration.sql`)
- `profiles.outstanding_advance int NOT NULL DEFAULT 0`
- `profiles.last_advance_at timestamptz`
(idempotent `ADD COLUMN IF NOT EXISTS`.)

### `lib/advance.ts` (pure)
- `ADVANCE_RATE`, `DAILY_MAX`, `MIN_CLAIM` constants.
- `borrowingCapacity(liveValue, outstanding) → int` (≥0).
- `claimableAdvance(liveValue, outstanding) → int` (capacity capped at DAILY_MAX,
  0 if below MIN_CLAIM).
- `repayAdvance(outstanding, proceeds) → { net, repaid, remaining }` — skim helper
  used at every credit-out.
- `isSameUtcDay(a, b) → boolean` for the once-a-day gate.
Fully unit-testable; no I/O.

### `GET /api/advance`
Returns `{ claimable, outstanding, liveValue, alreadyClaimedToday }`. Sums the
caller's open positions' live value via `sellShares` against each market's
reserves (same valuation the cash-out uses).

### `POST /api/advance`
Recompute liveValue server-side (never trust the client), enforce once-per-day
(`last_advance_at`), compute `claimableAdvance`; if ≥ MIN_CLAIM: credit it, set
`outstanding_advance += claim`, `last_advance_at = now`. Rate-limited. Returns
`{ claimed, credits, outstanding }`. Economic writes via the service role.

### Repayment hooks
- **`settleBets`** (resolve-expired): for a winning bet, before adding `payout`
  to credits, `repayAdvance(outstanding, payout)`; credit `net`, persist
  `remaining`. Losers credit nothing (debt persists, capacity-limited).
- **Cash-out route**: skim `repayAdvance(outstanding, cashoutValue)` before
  crediting; credit `net`, persist `remaining`.
(Voids/refunds are returns of the user's own stake — not proceeds — so they are
NOT skimmed.)

### UI
- A "🏦 Daily Advance" card in the **profile** (and the credits/wallet area):
  shows `claimable` with a Claim button; disabled with "Come back tomorrow" once
  claimed today; shows outstanding subtly ("Advance owed: N CR — repaid from
  winnings"). On claim: optimistic balance bump + toast.

## Data flow

```
Claim:  open positions ──sellShares──> liveValue
        capacity = 15%·liveValue − outstanding
        claim = min(capacity, 2000), if ≥100 and not claimed today
        credits += claim ; outstanding += claim ; last_advance_at = now

Repay:  position wins/cash-out ──> proceeds
        repaid = min(outstanding, proceeds)
        credits += proceeds − repaid ; outstanding -= repaid
```

## Error handling
- Already claimed today → 409 `{ alreadyClaimedToday: true }`, no credit.
- Capacity < MIN_CLAIM → 400 `Nothing available to advance yet`.
- No open positions → claimable 0.
- All economic writes via `createAdminClient()`; reads of reserves tolerate nulls
  (seed fallback, as Phase 1).

## Testing
- **Unit (`lib/advance.test.ts`-style runnable check):** capacity math; claim
  capped at DAILY_MAX and floored by MIN_CLAIM; `repayAdvance` skims correctly
  and never over-repays or goes negative; same-UTC-day gate.
- **Integration:** claim credits + records debt; second claim same day rejected;
  a winning settle repays from payout; a cash-out repays; capacity shrinks while
  debt outstanding; void does not skim.
- **Manual (prod):** hold a position, claim an advance, win/cash-out, confirm the
  debt is skimmed from proceeds and capacity restored.

## Out of scope (YAGNI)
- Interest. Repayment clawback from wallet on loss. Partial manual repayment.
- Advances against Phase 2 auto-bet escrow. Per-position (vs per-user) debt.
