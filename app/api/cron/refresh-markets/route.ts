import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateMarkets } from '@/lib/market-generator'
import { readFileSync } from 'fs'
import { join } from 'path'

// Allow up to 60 s on Vercel Pro (default hobby limit is 10 s).
// RSS fetches (8 × 8 s timeout) + Claude Haiku can easily exceed 10 s.
export const maxDuration = 60

// Read ANTHROPIC_API_KEY directly from .env.local if process.env is empty
// (happens when shell exports an empty ANTHROPIC_API_KEY that overrides .env.local)
function getAnthropicKey(): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY
  if (fromEnv) return fromEnv

  try {
    const envPath = join(process.cwd(), '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    return match?.[1]?.trim() ?? undefined
  } catch {
    return undefined
  }
}

// Vercel Cron calls this daily — also callable manually from the admin
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Also allow if called from the app itself (no secret in dev)
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createAdminClient()

  // 1. Generate new markets from today's news
  const anthropicKey = getAnthropicKey()

  let newMarkets: Awaited<ReturnType<typeof generateMarkets>> = []
  try {
    newMarkets = await generateMarkets(anthropicKey)
  } catch (err) {
    return NextResponse.json(
      { error: `Market generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }

  // 2. Insert new markets (skip duplicates by title)
  const { data: existing } = await supabase
    .from('markets')
    .select('title')
    .eq('resolved', false)

  const existingTitles = new Set((existing ?? []).map((m) => m.title.toLowerCase()))
  const toInsert = newMarkets.filter((m) => !existingTitles.has(m.title.toLowerCase()))

  let inserted = 0
  let insertError: string | null = null
  if (toInsert.length > 0) {
    const { error } = await supabase.from('markets').insert(toInsert)
    if (error) {
      insertError = error.message
    } else {
      inserted = toInsert.length
    }
  }

  // 3. Clean up resolved markets older than 7 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  const { count: cleaned } = await supabase
    .from('markets')
    .delete({ count: 'exact' })
    .eq('resolved', true)
    .lt('created_at', cutoff.toISOString())

  return NextResponse.json({
    success: true,
    generated: newMarkets.length,
    inserted,
    skippedDuplicates: newMarkets.length - inserted,
    cleaned: cleaned ?? 0,
    ...(insertError && { insertError }),
  })
}
