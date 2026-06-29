/**
 * Credit Shop — single source of truth for purchasable items.
 *
 * Items are bought with earned credits and grant a boost or consumable. Pure
 * config + helpers; no I/O. The purchase endpoint and the shop UI both read this.
 */

export type ShopItemKind = 'token' | 'timed' | 'freeze' | 'action'

export interface ShopItem {
  key: string
  name: string
  emoji: string
  description: string
  /** Price in credits. */
  price: number
  kind: ShopItemKind
}

/** 2x XP lasts this long after purchase. */
export const XP_BOOST_HOURS = 24
/** Double Down multiplies a single bet's payout by this. */
export const DOUBLE_DOWN_MULTIPLIER = 2
/** Safety Net refunds this fraction of stake on a losing bet. */
export const SAFETY_NET_REFUND_RATE = 0.5

export const SHOP_ITEMS: ShopItem[] = [
  {
    key: 'double_down',
    name: 'Double Down',
    emoji: '🎯',
    description: 'Your next bet pays 2× if you win — same stake, double the winnings.',
    price: 1500,
    kind: 'token',
  },
  {
    key: 'safety_net',
    name: 'Safety Net',
    emoji: '🛟',
    description: 'Auto-applies to your next loss — get 50% of your stake back.',
    price: 1200,
    kind: 'token',
  },
  {
    key: 'xp_boost',
    name: 'XP Boost',
    emoji: '⚡',
    description: `Earn 2× XP for ${XP_BOOST_HOURS} hours — rank up faster.`,
    price: 800,
    kind: 'timed',
  },
  {
    key: 'streak_freeze',
    name: 'Streak Freeze',
    emoji: '🧊',
    description: 'Automatically saves your streak on a missed day.',
    price: 1000,
    kind: 'freeze',
  },
  {
    key: 'streak_repair',
    name: 'Streak Repair',
    emoji: '🩹',
    description: 'Restore the streak you just lost. Only works right after a reset.',
    price: 2000,
    kind: 'action',
  },
]

export function getItem(key: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.key === key)
}

export function priceOf(key: string): number | null {
  return getItem(key)?.price ?? null
}

/** True when an XP boost is currently active. */
export function isXpBoostActive(xpBoostUntil: string | null | undefined, now: number = Date.now()): boolean {
  return !!xpBoostUntil && new Date(xpBoostUntil).getTime() > now
}

/** New xp_boost_until after buying a boost: extends from the later of now / current end. */
export function extendXpBoost(current: string | null | undefined, now: number = Date.now()): string {
  const base = Math.max(now, current ? new Date(current).getTime() : 0)
  return new Date(base + XP_BOOST_HOURS * 3_600_000).toISOString()
}
