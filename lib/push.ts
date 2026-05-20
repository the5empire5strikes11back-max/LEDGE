/**
 * Web Push delivery utility.
 * Requires three env vars (generate keys with: npx web-push generate-vapid-keys):
 *   VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (same value, exposed to client for subscription)
 */
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/server'

const VAPID_SUBJECT = 'mailto:admin@ledge.app'

function configurePush() {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(VAPID_SUBJECT, pub, priv)
    return true
  }
  return false
}

const pushReady = configurePush()

interface PushPayload {
  title: string
  body: string
  url?: string
}

interface StoredSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

async function deliverOne(sub: StoredSubscription, payload: PushPayload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    )
  } catch {
    // Stale or revoked subscription — silently discard
  }
}

/** Push to a single user. Fire-and-forget (don't await). */
export async function pushToUser(userId: string, payload: PushPayload) {
  if (!pushReady) return
  const supabase = createAdminClient()
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  await Promise.allSettled((subs ?? []).map((s) => deliverOne(s, payload)))
}

/** Push to every user who has an active bet on a specific market. */
export async function pushToMarketBettors(
  marketId: string,
  payload: PushPayload,
  excludeUserId?: string
) {
  if (!pushReady) return
  const supabase = createAdminClient()

  // Get distinct user IDs with open bets on this market
  const { data: bets } = await supabase
    .from('bets')
    .select('user_id')
    .eq('market_id', marketId)
    .is('won', null)

  const userIds = [...new Set((bets ?? []).map((b) => b.user_id))].filter(
    (id) => id !== excludeUserId
  )

  if (userIds.length === 0) return

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds)

  await Promise.allSettled((subs ?? []).map((s) => deliverOne(s, payload)))
}
