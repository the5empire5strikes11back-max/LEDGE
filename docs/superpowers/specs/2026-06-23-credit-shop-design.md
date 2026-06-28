# Credit Shop v1 — Design

**Date:** 2026-06-23
**Status:** Approved

## Goal

Give credits gravity: a shop where earned credits buy boosts and utility, so the
daily-drop / win loop has a point and credits never just sit there. Hero item is
**Double Down** (a bet pays 2×). Credits are the shop currency (earned-only for
now); a cash on-ramp to *buy* credits is deferred to Stripe and needs legal review
before enabling (pay-cash→boost-outcome = gambling-adjacent). The shop itself
(spending earned credits) is safe to ship.

## v1 items

| Key | Name | Effect | Price (credits) |
|---|---|---|---|
| `double_down` | 🎯 Double Down | Next bet pays **2×** on win (same stake) — consumable token | 1500 |
| `xp_boost` | ⚡ XP Boost | **2× XP for 24h** | 800 |
| `streak_freeze` | 🧊 Streak Freeze | Auto-saves a missed day (existing) | 1000 |

Out of scope (v2): Streak Repair, Market Spotlight, Gifting, premium currency.

## Schema (`supabase/shop-migration.sql`)
- `profiles.double_down_tokens int NOT NULL DEFAULT 0`
- `profiles.xp_boost_until timestamptz`
- (`streak_freezes` already exists.)

## `lib/shop.ts` (single source of truth)
- `SHOP_ITEMS`: array of `{ key, name, emoji, description, price, kind }`
  (`kind: 'token' | 'timed' | 'freeze'`).
- `priceOf(key)`, `getItem(key)`. Pure, no I/O.

## API
- **`GET /api/shop`** — returns the item catalog + the caller's inventory
  (`{ credits, double_down_tokens, xp_boost_until, streak_freezes }`).
- **`POST /api/shop`** `{ item }` — validate item, check credits, deduct price,
  grant the effect:
  - `double_down` → `double_down_tokens += 1`
  - `xp_boost` → `xp_boost_until = max(now, existing) + 24h`
  - `streak_freeze` → `streak_freezes += 1` (capped at FREEZE_CAP)
  Rate-limited; service-role writes. Returns new credits + inventory.

## Effect hooks
- **Double Down** — bet route accepts `useDoubleDown: boolean`. If true and a
  token is available + market is live: after `buyShares`, **double the shares**
  (`shares *= 2`), decrement the token. Stake unchanged → pure upside. Stored on
  the bet as usual; settlement/cash-out read the doubled shares (no other change).
- **XP Boost** — wherever XP is granted (bet `XP_PER_BET`, win settlement), if
  `xp_boost_until > now`, multiply the XP award by 2.

## UI
- **Shop screen/modal** — entry from the profile (and the "+ Buy" credits CTA can
  route here). Item cards: emoji, name, description, price, Buy button, owned
  count. "Out of credits? Get Plus / Buy credits" footer CTA.
- **Bet sheet** — a "🎯 Double Down" toggle (shown only when the user owns ≥1
  token), with copy "Pays 2× if you win." Passes `useDoubleDown` to the bet POST.
- Keep the existing `StreakFreezeCard` on profile (freeze is also in the shop).

## Error handling
- Insufficient credits / unknown item / freeze at cap → 4xx, no charge.
- Double Down with no token → bet proceeds normally (ignore the flag), no error.
- All economic writes via the service-role admin client.

## Testing
- Unit: `priceOf` / `getItem`; xp-boost-active check; double-down share doubling.
- Integration: purchase deducts credits + grants item; double-down bet doubles
  shares + consumes a token; XP boost doubles XP while active.
- Manual (prod): buy Double Down, place a bet with it on, confirm 2× payout shown
  + token decremented.

## Out of scope (v2+)
- Cash purchase of credits (Stripe + legal review). Streak Repair. Spotlight.
  Gifting. Premium currency. Cosmetics.
