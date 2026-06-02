import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { pushToUser } from '@/lib/push'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { winner } = body as { winner: 'yes' | 'no' }

  if (winner !== 'yes' && winner !== 'no') {
    return NextResponse.json({ error: 'winner must be yes or no' }, { status: 400 })
  }

  // Get market
  const { data: market, error: marketError } = await supabase
    .from('markets')
    .select('*')
    .eq('id', id)
    .single()

  if (marketError || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }

  if (market.resolved) {
    return NextResponse.json({ error: 'Market already resolved' }, { status: 400 })
  }

  // Mark market resolved
  await supabase
    .from('markets')
    .update({ resolved: true, winner })
    .eq('id', id)

  // Get all bets on this market
  const { data: bets } = await supabase
    .from('bets')
    .select('*')
    .eq('market_id', id)

  if (!bets?.length) {
    return NextResponse.json({ resolved: true, payouts: 0 })
  }

  // Fixed-odds: payout was locked at bet time and stored on the bet record
  const payoutPromises = bets.map(async (bet) => {
    const won = bet.side === winner
    const payout = won ? (bet.payout ?? 0) : 0

    // Update the bet
    await supabase
      .from('bets')
      .update({ won, payout })
      .eq('id', bet.id)

    // Credit the winner; notify all bettors
    if (!won) {
      void pushToUser(bet.user_id, {
        title: '📉 Market Settled',
        body: `"${market.title.length > 50 ? market.title.slice(0, 47) + '…' : market.title}" didn't go your way. Jump back in.`,
        url: '/',
      })
    }

    if (won && payout > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits, xp, streak')
        .eq('id', bet.user_id)
        .single()

      if (profile) {
        const profit = payout - bet.amount
        const profitStr = profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()

        await supabase
          .from('profiles')
          .update({
            credits: profile.credits + payout,
            xp: profile.xp + 60, // XP_PER_BET + XP_PER_WIN
          })
          .eq('id', bet.user_id)

        void pushToUser(bet.user_id, {
          title: '💰 Market Settled — You Won!',
          body: `${profitStr} CR profit on "${market.title.length > 40 ? market.title.slice(0, 37) + '…' : market.title}"`,
          url: '/',
        })
      }
    }

    return { userId: bet.user_id, won, payout }
  })

  const results = await Promise.all(payoutPromises)
  return NextResponse.json({ resolved: true, results })
}
