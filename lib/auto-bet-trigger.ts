/**
 * Auto-bet trigger engine.
 *
 * Fires resting auto-bets ("buy {side} for me if it drops to {target}%") whenever
 * a market's price moves. Credits were escrowed when the trigger was armed, so
 * firing just places the bet through the CPMM and moves the reserves — it never
 * touches the user's balance again.
 *
 * Called after any price change: a bet, a cash-out, or the Polymarket mirror sync.
 */

import type { createAdminClient } from '@/lib/supabase/server'
import { buyShares, yesPercent as ammYesPercent, priceOf, type Reserves, type Side } from '@/lib/amm'
import { pushToUser } from '@/lib/push'
import { logError } from '@/lib/logger'

type Admin = ReturnType<typeof createAdminClient>

interface AutoBetRow {
  id: string
  user_id: string
  side: Side
  target_percent: number
  amount: number
}

/**
 * Fire every pending auto-bet on `marketId` whose target the current price has
 * reached (side price ≤ target). Processes oldest-first, walking the reserves so
 * sequential fills price correctly, then persists the final reserves once.
 * Returns the number of triggers filled.
 */
export async function fireEligibleAutoBets(admin: Admin, marketId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: market } = await (admin as any)
    .from('markets')
    .select('id, yes_shares, no_shares, yes_percent, resolved, end_time, title')
    .eq('id', marketId)
    .maybeSingle()
  if (!market) return 0
  if (market.resolved || new Date(market.end_time) <= new Date()) return 0
  if (market.yes_shares == null || market.no_shares == null) return 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: triggers } = await (admin as any)
    .from('auto_bets')
    .select('id, user_id, side, target_percent, amount')
    .eq('market_id', marketId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const pending = (triggers ?? []) as AutoBetRow[]
  if (pending.length === 0) return 0

  let reserves: Reserves = { y: Number(market.yes_shares), n: Number(market.no_shares) }
  let filled = 0
  const title: string = market.title ?? 'a market'

  for (const t of pending) {
    try {
      const sidePct = Math.round(priceOf(reserves, t.side) * 100)
      if (sidePct > t.target_percent) continue // not crossed yet

      const { shares, reserves: next } = buyShares(reserves, t.side, t.amount)

      // Place the bet. Escrow was already taken at arm time, so no profile write.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: bet, error: betErr } = await (admin as any)
        .from('bets')
        .insert({ user_id: t.user_id, market_id: marketId, side: t.side, amount: t.amount, payout: shares, shares })
        .select('id')
        .single()

      if (betErr) {
        // Already holds a position on this market (one-per-market) → refund escrow.
        if (betErr.code === '23505') {
          await refundTrigger(admin, t.id, t.user_id, t.amount, 'cancelled')
        } else {
          logError(new Error(betErr.message ?? 'auto-bet insert failed'), { context: 'auto-bet:fire', autoBetId: t.id })
        }
        continue
      }

      reserves = next
      filled++

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from('auto_bets')
        .update({ status: 'filled', filled_bet_id: bet.id, filled_at: new Date().toISOString() })
        .eq('id', t.id)

      void pushToUser(t.user_id, {
        title: '🎯 Auto-bet hit!',
        body: `Bought ${t.side.toUpperCase()} at ${sidePct}% — "${title.length > 44 ? title.slice(0, 41) + '…' : title}"`,
        url: '/',
      })
    } catch (err) {
      logError(err, { context: 'auto-bet:fire', autoBetId: t.id })
    }
  }

  if (filled > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('markets')
      .update({ yes_shares: reserves.y, no_shares: reserves.n, yes_percent: ammYesPercent(reserves) })
      .eq('id', marketId)
  }

  return filled
}

/** Refund an auto-bet's escrowed credits and mark it with a terminal status. */
export async function refundTrigger(
  admin: Admin,
  autoBetId: string,
  userId: string,
  amount: number,
  status: 'cancelled' | 'expired'
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prof } = await (admin as any).from('profiles').select('credits').eq('id', userId).single()
  if (prof) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('profiles').update({ credits: (prof.credits ?? 0) + amount }).eq('id', userId)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('auto_bets').update({ status }).eq('id', autoBetId).eq('status', 'pending')
}

/** Refund + expire all pending triggers on a market (used when it closes/resolves). */
export async function expirePendingAutoBets(admin: Admin, marketId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pending } = await (admin as any)
    .from('auto_bets')
    .select('id, user_id, amount')
    .eq('market_id', marketId)
    .eq('status', 'pending')
  const rows = (pending ?? []) as { id: string; user_id: string; amount: number }[]
  for (const r of rows) {
    try {
      await refundTrigger(admin, r.id, r.user_id, r.amount, 'expired')
    } catch (err) {
      logError(err, { context: 'auto-bet:expire', autoBetId: r.id })
    }
  }
  return rows.length
}
