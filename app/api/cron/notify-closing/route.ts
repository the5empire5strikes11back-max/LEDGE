import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { pushToUser } from '@/lib/push'
import { logError, logMessage } from '@/lib/logger'

export const maxDuration = 30

/**
 * POST /api/cron/notify-closing
 *
 * Vercel Cron: runs every 6 hours.
 * Finds live markets closing in the next 2–6 hours and sends push + in-app
 * notifications to bettors who have open positions.
 *
 * We use a `notified_closing` boolean (or skip if already notified today)
 * to avoid spamming. Simple approach: just check if a notification was
 * already sent in the last 12h for this market.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createAdminClient()
  const now = new Date()
  const in2h = new Date(now.getTime() + 2 * 60 * 60_000).toISOString()
  const in6h = new Date(now.getTime() + 6 * 60 * 60_000).toISOString()

  // Find live unresolved markets closing in next 2–6 hours
  const { data: closingMarkets } = await supabase
    .from('markets')
    .select('id, title, end_time')
    .or('status.eq.live,status.is.null')
    .eq('resolved', false)
    .gt('end_time', in2h)
    .lt('end_time', in6h)

  if (!closingMarkets?.length) {
    return NextResponse.json({ notified: 0, reason: 'No markets closing in 2–6h window' })
  }

  let totalNotified = 0
  const errors: string[] = []

  for (const market of closingMarkets) {
    try {
      // Check if we already sent a closing notification for this market recently (last 12h)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'market_activity')
        .like('body', `%${market.id}%`)
        .gt('created_at', new Date(now.getTime() - 12 * 60 * 60_000).toISOString())

      if ((count ?? 0) > 0) continue  // already notified

      // Get all bettors on this market
      const { data: bets } = await supabase
        .from('bets')
        .select('user_id')
        .eq('market_id', market.id)

      if (!bets?.length) continue

      const uniqueUserIds = [...new Set(bets.map((b) => b.user_id))]
      const shortTitle = market.title.length > 45 ? market.title.slice(0, 42) + '…' : market.title
      const hoursLeft = Math.round((new Date(market.end_time).getTime() - now.getTime()) / 3_600_000)

      for (const userId of uniqueUserIds) {
        // Push notification
        void pushToUser(userId, {
          title: `⏰ Market closing in ~${hoursLeft}h`,
          body: `"${shortTitle}" — check the odds before it resolves.`,
          url: '/',
        })

        // In-app notification — embed market.id in body for dedup check above
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (supabase as any).from('notifications').insert({
          user_id: userId,
          type: 'market_activity',
          title: `⏰ Closes in ~${hoursLeft}h`,
          body: `[${market.id}] "${shortTitle}" is about to resolve. Last chance to bet.`,
          url: '/',
        })
      }

      totalNotified += uniqueUserIds.length
      logMessage(`Sent closing notifications for market ${market.id} to ${uniqueUserIds.length} bettors`, {
        context: 'cron:notify-closing',
        marketId: market.id,
      })
    } catch (err) {
      logError(err, { context: 'cron:notify-closing', marketId: market.id })
      errors.push(market.id)
    }
  }

  return NextResponse.json({
    success: true,
    markets_checked: closingMarkets.length,
    notified: totalNotified,
    errors,
  })
}
