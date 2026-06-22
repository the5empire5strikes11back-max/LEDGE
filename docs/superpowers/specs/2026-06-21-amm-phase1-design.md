# AMM Phase 1 — Continuous Share-Based Market + Live Position Value

**Date:** 2026-06-21
**Status:** Approved (full delegation — decisions made by implementer)

## Goal

Replace Ledge's fixed-odds engine with a real constant-product market maker
(CPMM) over **shares**, while keeping the one-tap surface and the "locked max
payout" feel users have today. Phase 1 of the larger AMM roadmap (Phase 2 =
auto-bet / limit orders, Phase 3 = advances / loans). Those phases depend on this
engine and are out of scope here.

## The synthesis

- Today: a bet locks a payout forever (`calculateFixedOddsPayout`, 5% margin).
  Sportsbook, not a market. Cash-out is an approximation bolted on → drift.
- CPMM: spend credits → receive **N shares**; each winning share pays 1 credit.
- Key: **N (shares) is locked at purchase** → max payout still fixed (charm kept),
  but the **live value** = `N × current price` floats. One engine now drives
  price, buy, sell/cash-out, and settlement → exact, consistent, no drift.

Ledge's existing `lockedPayout` already *is* a share count; we just make the
value move and the math real.

## CPMM model (`lib/amm.ts`, pure + unit-tested)

Reserves `y` (YES shares), `n` (NO shares); invariant `k = y · n`.

- **Price (prob of YES)** = `n / (y + n)`. Exposed as `priceYes(y, n)` ∈ (0,1).
- **Buy** side with `M` credits: add `M` to both reserves, withdraw shares of the
  bought side to restore `k`.
  `sharesYes = (y + M) − k/(n + M)` (NO symmetric). New reserves:
  `(y + M − sharesYes, n + M)`.
- **House margin (5%)** baked in once, at purchase:
  `shares = floor(rawShares × (1 − HOUSE_MARGIN))`, `HOUSE_MARGIN = 0.05`.
  Applies to both win-payout and cash-out (both derive from `shares`), preserving
  today's economics and preventing round-trip arbitrage.
- **Sell / cash-out** of `s` shares: solve for credits `C` such that returning the
  shares restores the invariant — `(y + s − C)(n − C) = k` for a YES sale (NO
  symmetric). Quadratic; take the economically valid root, `C = floor(C)`,
  clamped to `[0, s]`. Updates reserves to `(y + s − C, n − C)`.
- Pure functions only: `priceYes`, `buyShares`, `sellShares`. No I/O. Fully
  unit-tested (see Testing).

## Schema (`supabase/amm-phase1-migration.sql`)

- `markets.yes_shares numeric`, `markets.no_shares numeric` — live CPMM reserves.
- `bets.shares numeric` — shares held (locked max payout).
- **Backfill markets:** initialise reserves so `priceYes = yes_percent/100` at a
  depth `D` derived from base liquidity + accumulated volume:
  `n = D · p`, `y = D · (1 − p)` where `p = yes_percent/100`,
  `D = (virtual_yes_pool + virtual_no_pool + total_credits)` (falls back to a
  category default if null). Guarantees current odds are preserved on migration.
- **Backfill bets:** `shares = COALESCE(payout, amount)` (legacy payout = share
  count). Idempotent (`ADD COLUMN IF NOT EXISTS`, guarded UPDATE on null).

`yes_percent` stays the single display field every UI already reads — recomputed
as `round(priceYes × 100, 1)` on every trade. No UI field renames.

## Wiring

- **`app/api/bets/route.ts`** — replace `calculateFixedOddsPayout` with
  `buyShares(reserves, side, amount)`. Store `shares` (and mirror into `payout`
  for backward compat). Update `yes_shares/no_shares` + `yes_percent` atomically.
  Keep all existing guards (circle cap, poll guard, rate limit, momentum/whale
  notifications driven off the new `yes_percent`).
- **`app/api/bets/cashout/route.ts`** — replace the approximation with
  `sellShares(reserves, side, bet.shares)`. Update reserves + `yes_percent`,
  credit the user, delete the position. Value now equals the displayed live value.
- **`app/api/markets/resolve-expired/route.ts`** — `settleBets` pays winners
  `bet.shares` (each share = 1 cr), losers 0. Functionally same as today since
  legacy `payout == shares`; just read `shares` with `payout` fallback. Void path
  unchanged.
- **Live position value** — surface `shares × sidePrice` wherever a user's open
  position shows (bets GET, market detail). Copy: "Worth **X** now · up to **N**
  if YES."
- **Seed** — new markets initialise `yes_shares/no_shares` from `seedLiquidity`
  (reuse the existing virtual pool split as opening reserves).

## Surface (unchanged feel)

Tap YES → "you'll get up to **N** if YES." Live: "Worth **X** now." Cash out =
one tap, exact. No shares jargon, no order book, no bid/ask.

## Error handling

- All economic writes via `createAdminClient()` (service role), as today.
- Reserves never go ≤ 0; `buyShares`/`sellShares` clamp and guard divide-by-zero
  (empty pool → price 0.5). Sell clamps `C ∈ [0, s]`.
- Insufficient credits, closed market, poll guard, duplicate bet — all preserved.

## Testing

- **Unit (`lib/amm.test.ts`):** price monotonicity (buying YES raises price);
  invariant `k` preserved across buy then the matching sell (within rounding);
  buy then immediate sell returns **< stake** (the 5% spread, no arbitrage);
  shares > stake when price < 1; symmetric YES/NO; empty/degenerate pools → 0.5;
  margin applied exactly once.
- **Integration:** bet updates reserves + `yes_percent`; cash-out value equals
  displayed live value; settlement pays `shares` to winners; legacy bet
  (`shares` null → payout) settles identically.
- **Manual:** place a bet, watch live value move as odds move, cash out, confirm
  the cash-out equals the shown value (the 189-vs-193 drift is gone).

## Out of scope (later phases / YAGNI)

- Auto-bet / limit orders (Phase 2). Advances / loans (Phase 3).
- User-provided liquidity. Per-share UI, order books, bid/ask.
- Grouped-market AMM nuance beyond per-option binary reserves (each option already
  a binary market; same engine applies per option).
