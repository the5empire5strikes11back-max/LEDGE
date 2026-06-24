# AMM Phase 2 — Auto-bet (limit orders, reframed)

**Date:** 2026-06-23
**Status:** Approved (full delegation)

## Goal

Let a user set a resting trigger — "Bet YES for me if it drops to 30%" — that
fires automatically when the market reaches their target. Manifold's limit
orders, reframed as a one-line "set a target" with no order book exposed. Built
on the Phase 1 CPMM (`lib/amm.ts`).

## User mental model

Pick a **side**, a **target chance**, and an **amount**. When that side's price
falls to (or below) the target, Ledge buys for you and notifies you. Cancel
anytime for a full refund; auto-refunded if the market closes first.

## Decisions

- **Escrow at arm time.** Credits are deducted when the auto-bet is armed, not
  when it fires — guarantees execution and prevents double-spending the same
  credits. Cancel / expiry / market-close → full refund.
- **Evaluate on every price move.** A shared helper fires eligible triggers
  whenever a market's price changes (bet, cash-out, Polymarket mirror sync). No
  separate polling cron — every price source already routes through code we hook.
- **Direction: fire when `side price ≤ target`** (buy the dip / get odds at least
  as good as the target). "Fire when it rises" is out of scope.
- **One pending auto-bet per user per market**, and disallowed if the user
  already holds a position (betting is one-per-market; a filled auto-bet becomes
  that one position).

## Schema (`supabase/auto-bets-migration.sql`)

```
auto_bets (
  id            uuid PK default gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  market_id     uuid NOT NULL REFERENCES markets(id)  ON DELETE CASCADE,
  side          text NOT NULL CHECK (side IN ('yes','no')),
  target_percent int  NOT NULL CHECK (target_percent BETWEEN 1 AND 99),
  amount        int  NOT NULL CHECK (amount > 0),   -- escrowed credits
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','filled','cancelled','expired')),
  filled_bet_id uuid REFERENCES bets(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  filled_at     timestamptz
)
-- one live trigger per user per market
CREATE UNIQUE INDEX auto_bets_one_pending
  ON auto_bets(user_id, market_id) WHERE status = 'pending';
CREATE INDEX auto_bets_market_pending
  ON auto_bets(market_id) WHERE status = 'pending';
ALTER TABLE auto_bets ENABLE ROW LEVEL SECURITY;  -- all access via service role
```

## Trigger helper (`lib/auto-bet-trigger.ts`)

`fireEligibleAutoBets(admin, marketId)`:
1. Load the market's current reserves (`yes_shares`, `no_shares`) + `end_time`.
   Skip if resolved/closed.
2. Fetch pending auto-bets for the market, oldest first.
3. For each, in order: compute the side's current price from live reserves; if
   `sidePercent ≤ target_percent`, fire:
   - `buyShares(reserves, side, amount)` → shares + new reserves (credits already
     escrowed, so no profile deduction here).
   - Insert the bet (`shares`, `payout=shares`); if the user already has a bet on
     this market (unique violation), mark the auto-bet `cancelled` + refund.
   - Mark auto-bet `filled` + `filled_bet_id`; carry the new reserves into the
     next iteration so sequential fills walk the price.
   - Push "⏱ Your auto-bet hit — bought {SIDE} at {pct}%".
4. After processing, persist the final reserves + `yes_percent` once.

Pure-ish: all economic writes via the service-role admin client. Wrapped in
try/catch per auto-bet so one failure never blocks the rest.

## Wiring

- **Bet route** & **cash-out route**: after updating reserves, call
  `fireEligibleAutoBets(admin, marketId)`. (A trade can push the price into
  someone's target.)
- **Mirror-polymarket cron**: after re-syncing a market's price, call it too.
- **resolve-expired**: before resolving a market, refund + mark `expired` any
  still-pending auto-bets (so escrow is never trapped in a closed market).

## Endpoints

- `POST /api/auto-bets` `{market_id, side, target_percent, amount}` — validate
  (amount via existing `validateBetAmount`, target 1–99, market live, not a poll,
  no existing position, no existing pending trigger), escrow credits, insert.
  Rate-limited like bets.
- `DELETE /api/auto-bets/[id]` — owner-only; refund escrow, mark `cancelled`.
- `GET /api/auto-bets` — the caller's pending triggers (joined market title/odds).

Markets API `userBet` gains an optional sibling `autoBet` ({side, target_percent,
amount}) so the feed/detail can show an armed trigger.

## UI

- **Bet sheet** (`create`/bet flow): a "🎯 Set a target" toggle. On: the amount
  chips stay, plus a target-chance picker (chips 10/25/40/… or a small stepper);
  primary button switches to "Arm auto-bet at {pct}%". Off: today's instant buy.
- **Position/market card**: when an auto-bet is armed, show "⏱ Auto-bet · {SIDE}
  at {pct}% · {amount} CR" with a Cancel action.
- **Notifications**: push + in-app on fire (reuse `pushToUser` + `notifications`).

## Error handling

- Insufficient credits at arm → 400, no escrow.
- Duplicate pending trigger / existing position → 409.
- Cancel of a non-pending / non-owned trigger → 404/409, no double refund.
- Fire-time unique-bet collision → cancel + refund (never lose escrow).
- All firing wrapped per-item; failures logged, others proceed.

## Testing

- **Unit (`lib/auto-bet-trigger.test.ts`-style runnable check):** condition
  (`sidePercent ≤ target`) for yes/no; sequential fires walk reserves; a fire
  that can't place (already-positioned) refunds; resolved market fires nothing.
- **Integration:** arm escrows credits; a crossing trade fires it and places the
  bet; cancel refunds; market close refunds pending.
- **Manual (prod):** arm "YES at X% below current", push price down past X with a
  NO/▼ trade from another account, confirm it fires + notifies + escrow→bet.

## Out of scope (YAGNI / later)

- "Fire when it rises to X." Multiple triggers per market. Partial fills.
- Good-till-date beyond market close. Advances/loans (Phase 3).
