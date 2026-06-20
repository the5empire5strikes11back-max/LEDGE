/**
 * POST /api/markets/group
 *
 * Creates a multi-option market as a GROUP of binary YES/NO markets sharing a
 * group_id — one market row per option. Powers Multiple Choice, Numeric (ranges),
 * Date (windows), and Set (independent). Each option reuses the full binary
 * engine: odds, betting, cash-out, the CHANCE display, auto-resolution.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { validateMarket } from '@/lib/market-validation'
import { GROUP_EXCLUSIVE, normalizeOptions, type GroupType } from '@/lib/market-groups'
import { rateLimit, LIMITS } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

const ALLOWED_CATEGORIES = ['Sports', 'Politics', 'Culture', 'Tech', 'Viral', 'Wild']
const GROUP_TYPES: GroupType[] = ['multiple_choice', 'numeric', 'date', 'set']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const rl = await rateLimit(admin, { key: `${user.id}:marketsCreate`, ...LIMITS.marketsCreate })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many markets created. Try again later.' }, { status: 429 })
  }

  const body = await request.json().catch(() => ({}))
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const category = body.category
  const endTime = body.end_time
  const type = body.type as GroupType
  const criteria = typeof body.criteria === 'string' ? body.criteria.trim() : ''
  const options = normalizeOptions(Array.isArray(body.options) ? body.options : [])

  if (!question || !category || !endTime) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  if (!GROUP_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid market type' }, { status: 400 })
  if (options.length < 2) return NextResponse.json({ error: 'Add at least 2 options' }, { status: 400 })
  if (options.length > 12) return NextResponse.json({ error: 'Up to 12 options' }, { status: 400 })
  if (!ALLOWED_CATEGORIES.includes(category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  if (question.length < 8 || question.length > 200) return NextResponse.json({ error: 'Question must be 8–200 characters' }, { status: 400 })

  const endIso = new Date(endTime).toISOString()
  const temporal = validateMarket({ title: question.endsWith('?') ? question : `${question}?`, endTimeIso: endIso })
  if (!temporal.valid) return NextResponse.json({ error: temporal.reason }, { status: 422 })

  const exclusive = GROUP_EXCLUSIVE[type] ?? true
  const groupId = randomUUID()
  // Opening odds: exclusive → each option's share (1/N); independent Set → 50/50.
  const openingPct = exclusive ? Math.max(2, Math.round(100 / options.length)) : 50
  const DEPTH = 8_000
  const vy = Math.round((DEPTH * openingPct) / 100)
  const vn = DEPTH - vy

  const rows = options.map((opt) => ({
    title: `${question} — ${opt}`,
    category,
    group_id: groupId,
    group_label: question,
    option_label: opt,
    group_type: type,
    group_exclusive: exclusive,
    yes_percent: openingPct,
    virtual_yes_pool: vy,
    virtual_no_pool: vn,
    yes_pool: 0,
    no_pool: 0,
    total_credits: 0,
    hot_score: 0,
    end_time: endIso,
    resolved: false,
    resolution_criteria: criteria || `Resolves YES if "${opt}" is the outcome.`,
    created_by: user.id,
    ...(typeof body.subcategory === 'string' && body.subcategory ? { subcategory: body.subcategory } : {}),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('markets').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ group_id: groupId, options: options.length, type })
}
