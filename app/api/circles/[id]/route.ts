import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // Verify the requester is the circle creator
  const { data: circle, error: fetchError } = await supabase
    .from('circles')
    .select('id, created_by')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !circle) {
    return NextResponse.json({ error: 'Circle not found' }, { status: 404 })
  }

  if (circle.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the circle creator can delete it' }, { status: 403 })
  }

  // Cascade manually (in case FK cascades aren't set up):
  // 1. Bets on circle markets
  const { data: circleMarkets } = await supabase
    .from('markets')
    .select('id')
    .eq('circle_id', id)

  const marketIds = (circleMarkets ?? []).map((m) => m.id)

  if (marketIds.length > 0) {
    await supabase.from('bets').delete().in('market_id', marketIds)
    await supabase.from('markets').delete().in('id', marketIds)
  }

  // 2. Circle members
  await supabase.from('circle_members').delete().eq('circle_id', id)

  // 3. Circle itself
  const { error: deleteError } = await supabase.from('circles').delete().eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
