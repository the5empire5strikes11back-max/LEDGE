import Anthropic from '@anthropic-ai/sdk'
import { validateMarket, MARKET_DURATION, describeValidation } from '@/lib/market-validation'
import { verifySportsMarkets } from '@/lib/espn-verify'

// ── RSS Feeds ────────────────────────────────────────────────────────────────
// Curated for Gen Z relevance: sports drama, entertainment, celebrity, gaming,
// viral culture. Business/finance feed REMOVED — it produced corporate garbage.

const RSS_FEEDS = [
  // Sports — major sources for game outcomes + drama
  { url: 'https://www.espn.com/espn/rss/news',               category: 'Sports'   },
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml',           category: 'Sports'   },
  { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',  category: 'Sports'   },

  // Entertainment / celebrity — high social discussability
  { url: 'https://variety.com/feed/',                        category: 'Culture'  },
  { url: 'https://deadline.com/feed/',                       category: 'Culture'  },
  { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', category: 'Culture' },

  // Music — artist drama, chart battles, drops
  { url: 'https://www.billboard.com/feed/',                  category: 'Culture'  },

  // Tech — AI, gadgets, gaming, big-tech moves (own category now, not "Culture")
  { url: 'https://www.theverge.com/rss/index.xml',           category: 'Tech'     },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'Tech'     },
  { url: 'https://techcrunch.com/feed/',                     category: 'Tech'     },
  { url: 'https://www.engadget.com/rss.xml',                 category: 'Tech'     },

  // Viral — internet culture, memes, trending social moments
  { url: 'https://mashable.com/feeds/rss/all',               category: 'Viral'    },

  // Politics — only breaking / emotionally charged stories
  { url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', category: 'Politics' },
]

/** Every category the generator can emit — must mirror ALLOWED_CATEGORIES. */
export type GeneratedCategory = 'Sports' | 'Politics' | 'Culture' | 'Tech' | 'Viral' | 'Wild'

const GENERATED_CATEGORIES: readonly GeneratedCategory[] = [
  'Sports', 'Politics', 'Culture', 'Tech', 'Viral', 'Wild',
]

export interface GeneratedMarket {
  title: string
  category: GeneratedCategory
  end_time: string
  jackpot_pool: number
  resolution_criteria: string
  resolution_source_url: string
  target_data_key: string
  /** System-estimated YES probability (30–70). Shown as "System estimate" until real bets arrive. */
  starter_probability: number
}

export interface GenerationOptions {
  /**
   * When true, bias generation toward Sports. Legacy flag — still honored, but
   * categoryTargets takes precedence when provided.
   */
  sportsHeavy?: boolean
  /**
   * Per-category counts the feed currently NEEDS (its deficit below floor).
   * When provided, generation focuses on these categories in these proportions
   * so every category is driven toward its 15-market floor — including Tech,
   * Viral, and Wild, which have no dedicated news feed.
   */
  categoryTargets?: Partial<Record<GeneratedCategory, number>>
  /** Total questions to ask the model for. Defaults to 40. */
  totalTarget?: number
}

/**
 * Tolerantly extract complete top-level JSON objects from a (possibly truncated)
 * array response. Brace-counts while respecting strings/escapes, so a response
 * cut off mid-object — which happens when the model hits max_tokens — still
 * yields every COMPLETE market before the cutoff instead of throwing on the
 * unterminated tail and losing the entire batch.
 */
function extractJsonObjects(text: string): unknown[] {
  const start = text.indexOf('[')
  const body = start >= 0 ? text.slice(start + 1) : text
  const objects: unknown[] = []
  let depth = 0
  let inStr = false
  let esc = false
  let objStart = -1
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') { if (depth === 0) objStart = i; depth++ }
    else if (ch === '}') {
      depth--
      if (depth === 0 && objStart >= 0) {
        try { objects.push(JSON.parse(body.slice(objStart, i + 1))) } catch { /* skip malformed */ }
        objStart = -1
      }
    } else if (ch === ']' && depth === 0) {
      break
    }
  }
  return objects
}

function extractTitlesFromRSS(xml: string): string[] {
  const titles: string[] = []
  const matches = xml.matchAll(/<item[^>]*>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gi)
  for (const match of matches) {
    const title = match[1].trim()
    if (title && title.length > 10 && title.length < 200) {
      titles.push(title)
    }
  }
  return titles.slice(0, 10)
}

async function fetchFeed(url: string, category: string): Promise<{ headline: string; category: string }[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Ledge/1.0 RSS Reader' },
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!res.ok) return []
    const xml = await res.text()
    return extractTitlesFromRSS(xml).map((headline) => ({ headline, category }))
  } catch {
    clearTimeout(timer)
    return []
  }
}

async function fetchHeadlines(): Promise<{ headline: string; category: string }[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(({ url, category }) => fetchFeed(url, category))
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}

export async function generateMarkets(
  apiKey?: string,
  options: GenerationOptions = {}
): Promise<GeneratedMarket[]> {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY not set')

  const headlines = await fetchHeadlines()
  if (headlines.length === 0) throw new Error('No headlines fetched')

  const client = new Anthropic({ apiKey: key })
  const now = new Date()
  const totalTarget = options.totalTarget ?? 40

  // Per-category creative briefs — reused whether targeting deficits or balanced.
  const CATEGORY_BRIEFS: Record<GeneratedCategory, string> = {
    Sports:   'game outcomes, player performance, match results, tournament runs (prefer hours_until_close 12–48)',
    Culture:  'entertainment, awards, celebrity beef, music drops, movie box office, TV finales',
    Politics: 'ONLY hot-button, viral, emotionally charged political events — never procedure or policy wonkery',
    Tech:     'AI/gadget/game releases or announcements expected in the NEXT FEW DAYS, big-tech drama unfolding now (not "by end of year")',
    Viral:    'a trend/meme/creator beef happening NOW that will blow up or fizzle within 48–72h (resolve via whether it dominates the feed this week)',
    Wild:     'fun wildcard predictions that resolve within 7 days from a public source — a surprise drop, a viral moment, an upset THIS week (never open-ended "will it ever happen")',
  }

  // Build the distribution block. When categoryTargets is supplied (the feed is
  // short in specific categories), focus generation there so every category is
  // driven toward its floor. Otherwise fall back to balanced / sports-heavy.
  let distributionInstruction: string
  const targets = options.categoryTargets
  if (targets && Object.values(targets).some((n) => (n ?? 0) > 0)) {
    const lines = GENERATED_CATEGORIES
      .map((c) => ({ c, n: targets[c] ?? 0 }))
      .filter(({ n }) => n > 0)
      .sort((a, b) => b.n - a.n)
      .map(({ c, n }) => `- ${c}: ~${n} markets — ${CATEGORY_BRIEFS[c]}`)
    distributionInstruction =
      `CATEGORY DISTRIBUTION (fill the feed's current gaps — generate the counts below):\n${lines.join('\n')}\n` +
      `Hit these category counts as closely as you can; these categories are below their live-market floor.`
  } else if (options.sportsHeavy) {
    distributionInstruction = `CATEGORY DISTRIBUTION (Sports inventory critically low — boost Sports now):
- Sports: ~16 markets — ${CATEGORY_BRIEFS.Sports}
- Culture: ~8 markets — ${CATEGORY_BRIEFS.Culture}
- Tech: ~6 markets — ${CATEGORY_BRIEFS.Tech}
- Viral: ~4 markets — ${CATEGORY_BRIEFS.Viral}
- Politics: ~3 markets — ${CATEGORY_BRIEFS.Politics}
- Wild: ~3 markets — ${CATEGORY_BRIEFS.Wild}`
  } else {
    distributionInstruction = `CATEGORY DISTRIBUTION (balanced — ~equal across all six categories):
${GENERATED_CATEGORIES.map((c) => `- ${c}: ~7 markets — ${CATEGORY_BRIEFS[c]}`).join('\n')}`
  }

  const prompt = `You are generating prediction markets for Ledge — a Gen Z social betting app (fake credits, no real money).

Today is ${now.toDateString()}. The exact current time is ${now.toISOString()} (UTC).
Anchor every event_date relative to this instant — never use a date in the past.

TARGET AUDIENCE: Gen Z (ages 16–26). Deeply online. They care about: sports drama, celebrity beef, viral TikTok moments, music drops, gaming, TV finales, relationship gossip, award show upsets. They are BORED by: corporate earnings, monetary policy, legislative procedure, geopolitical acronyms, anything requiring expert knowledge.

THE GEN Z TEST: Before writing a market, ask — "Would someone text this to their friends?" If not, drop it.

EXAMPLES OF GREAT MARKETS (use as reference for tone and energy):
✅ "Will Drake respond within 48 hours?"
✅ "Will the Knicks force Game 7?"
✅ "Will GTA 6 drop another trailer this month?"
✅ "Will Taylor Swift attend the Super Bowl?"
✅ "Will [team] win tonight?"
✅ "Will [artist] cancel their tour dates?"

EXAMPLES OF BAD MARKETS — NEVER GENERATE THESE:
❌ Anything about: GDP, CPI, inflation, interest rates, earnings, trade deficit, bond yields
❌ Anything about: parliamentary procedure, cloture, filibuster, reconciliation, appropriations
❌ Anything about: bilateral agreements, sanctions, geopolitical negotiations, diplomatic accords
❌ Anything about: semiconductor supply chains, logistics, quarterly projections
❌ Vague questions with no clear resolution: "Will [policy] work?"
❌ Questions requiring expert knowledge to understand

Here are today's news headlines:
${headlines.map((h, i) => `${i + 1}. [${h.category}] ${h.headline}`).join('\n')}

Generate exactly ${totalTarget} yes/no prediction market questions based on these headlines AND your knowledge of what's happening this week (use this especially for Tech, Viral, and Wild, which have fewer headlines). Requirements:
- HARD RULE: the outcome MUST resolve within the next 7 days (168 hours). event_date must be 7 days from now or sooner. If your idea only resolves later, DON'T generate it — pick a nearer milestone instead.
- Exciting and personally relevant to Gen Z
- Natural, conversational language — like a bet you'd make with your friend
- Be PRECISE about timing — a game tonight closes in hours, not days

REJECT YOUR OWN LONG-HORIZON IDEAS — these resolve too far out and will be thrown away:
❌ "before the end of [month]"  ❌ "this season"  ❌ "by [year]" / "before 2027"
❌ "next Christmas"  ❌ "at the Oscars" (unless within 7 days)  ❌ "eventually"
Instead anchor to the next 1–7 days: a release THIS week, a game tonight, a trend that
either blows up or fizzles in 48–72h, an announcement expected in the next few days.

CRITICAL — FRESHNESS GATE (read carefully, this is the #1 quality problem):
- ONLY generate markets whose outcome is genuinely STILL UNDECIDED and resolves in the FUTURE.
- A headline reports something that ALREADY HAPPENED. Do NOT turn "Lakers beat Celtics" into
  "Will the Lakers beat the Celtics?" — that game is over. Instead anchor to the NEXT undecided
  event (their next game, the series, a player's next performance).
- For every market set "event_status":
    "upcoming" — the event has not happened yet (e.g., a game tonight/tomorrow)
    "live"     — happening right now, outcome not yet final
    "past"     — already concluded/decided  → DO NOT INCLUDE IT
    "unknown"  — you cannot tell when it resolves  → DO NOT INCLUDE IT
- Only include markets with event_status "upcoming" or "live". Omit "past" and "unknown" entirely.
- Set "event_date" to the event's scheduled date-time in ISO 8601 (your best anchor; the moment the
  outcome becomes known). "hours_until_close" must land shortly AFTER that, never before.

${distributionInstruction}

Return ONLY a JSON array, no other text:
[
  {
    "title": "Will the Lakers beat the Celtics tonight?",
    "category": "Sports",
    "event_status": "upcoming",
    "event_date": "2025-06-10T23:30:00Z",
    "hours_until_close": 8,
    "jackpot_pool": 50000,
    "starter_probability": 45,
    "resolution_criteria": "YES if Lakers win per official NBA box score.",
    "resolution_source_url": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
    "target_data_key": "{\"type\":\"espn_game\",\"team\":\"LAL\",\"condition\":\"win\"}"
  }
]

Rules:
- category must be exactly one of: "Sports", "Politics", "Culture", "Tech", "Viral", "Wild"
- event_status: "upcoming" or "live" only (drop "past"/"unknown" entirely — do not output them)
- event_date: ISO 8601 datetime of when the outcome becomes known; must be in the future
- hours_until_close: use 4–12 for events today, 24–48 for tomorrow, up to 168 (7 days) max; must land shortly AFTER event_date
- jackpot_pool must be 10000–500000
- resolution_criteria: one precise sentence defining exactly what makes this YES vs NO
- starter_probability: your best estimate (30–70) of the YES likelihood based on context, base rates, and how the headline frames the outcome. Use 50 ONLY when genuinely uncertain. Examples: home-team favourite winning tonight → 58–65; underdog upset → 32–42; incumbent keeping a lead → 60–68; celebrity doing something dramatic → 35–45. Never go below 30 or above 70 — markets must stay debatable.

RESOLUTION STRATEGY — pick in strict priority order:

━━ TIER 1 — espn_game ━━ (use for ANY market about a team winning a specific game)
- NBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
- NFL: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
- MLB: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard"
- NHL: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard"
- EPL: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard"
- La Liga: "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard"
- Champions League: "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard"
target_data_key: {"type":"espn_game","team":"<ABBR>","condition":"win"}
NBA: LAL BOS GSW MIA CHI NYK PHX DEN MIL PHI BKN LAC DAL HOU ATL
NFL: NE KC DAL SF GB BUF BAL CIN PHI LAR MIA DEN CHI NYG SEA

━━ TIER 2 — json_field ━━ (free, auth-free JSON API with a checkable field)
Use for non-game sports outcomes, rankings, factual checks.
target_data_key: {"type":"json_field","path":"<dot.path>","yes_value":"<exact_string>"}

━━ TIER 3 — rss_keyword ━━ (LAST RESORT — politics, culture, entertainment only)
KEYWORD RULES — violations cause false resolutions:
  • Each term MUST be a multi-word phrase (never a single common word)
    BAD: "yes_terms": ["passes", "drops"]
    GOOD: "yes_terms": ["bill passes Senate", "album drops Friday", "Taylor cancels"]
  • 2–4 terms per side, specific enough that only a direct headline about THIS market matches
resolution_source_url — you MUST use ONE of these EXACT urls verbatim. Do NOT invent or
modify any url (made-up paths 404 and make the market unresolvable → it gets rejected):
  - US politics: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml"
  - World events: "https://feeds.bbci.co.uk/news/world/rss.xml"
  - Entertainment / Culture / Viral: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml"
  - Tech / gaming / AI: "https://feeds.bbci.co.uk/news/technology/rss.xml"
  - Sports (non-ESPN): "https://feeds.bbci.co.uk/sport/rss.xml"
target_data_key: {"type":"rss_keyword","yes_terms":["<phrase1>","<phrase2>"],"no_terms":["<phrase3>","<phrase4>"]}

For Tech, Viral, and Wild markets you will almost always use TIER 3 (rss_keyword) with the
Tech or Entertainment feed above. Keep yes_terms specific multi-word phrases naming the exact
event so only a headline about THIS market can resolve it.`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    // Headroom for a full batch of richly-specified markets. Under-sizing this
    // truncates the JSON mid-object; the salvage parser below tolerates that,
    // but more room means fewer markets lost to the cutoff.
    max_tokens: 20000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  // Tolerant parse: salvage every complete object even if the array was
  // truncated at max_tokens (a single unterminated tail no longer dumps the batch).
  const raw = extractJsonObjects(text) as Array<{
    title: string
    category: string
    event_status?: string
    event_date?: string
    hours_until_close: number
    jackpot_pool: number
    starter_probability?: number
    resolution_criteria: string
    resolution_source_url?: string
    target_data_key?: string
  }>

  if (raw.length === 0) {
    throw new Error(`No parseable markets in response: ${text.slice(0, 200)}`)
  }

  const nowMs = now.getTime()
  const built: GeneratedMarket[] = []
  const dropped: string[] = []

  for (const m of raw) {
    // Freshness gate #1 — the model self-reported the event already happened or
    // is unanchored. Trust it and drop before doing anything else.
    const status = (m.event_status ?? '').toLowerCase()
    if (status === 'past' || status === 'unknown') {
      dropped.push(`event_status=${status || 'missing'}: "${m.title}"`)
      continue
    }

    // Category gate — the model must emit one of the six allowed categories.
    // Drop anything off-list rather than letting a bad label reach the DB.
    if (!GENERATED_CATEGORIES.includes(m.category as GeneratedCategory)) {
      dropped.push(`invalid_category=${m.category}: "${m.title}"`)
      continue
    }

    // Derive end_time from a clamped close window (relative offset is far more
    // reliable than trusting an absolute LLM date for the *close* moment).
    const hours = Math.max(4, Math.min(MARKET_DURATION.AI_PREFERRED_MAX_HOURS, m.hours_until_close ?? 24))
    const endTime = new Date(nowMs + hours * 60 * 60 * 1000)
    const rawProb = m.starter_probability ?? 50
    const starterProbability = Math.max(30, Math.min(70, Math.round(rawProb)))

    const candidate: GeneratedMarket = {
      title: m.title,
      category: m.category as GeneratedMarket['category'],
      end_time: endTime.toISOString(),
      jackpot_pool: Math.max(10000, m.jackpot_pool),
      starter_probability: starterProbability,
      resolution_criteria: m.resolution_criteria ?? 'Resolves YES or NO based on official results.',
      resolution_source_url: m.resolution_source_url ?? '',
      target_data_key: m.target_data_key ?? '',
    }

    // Freshness gate #2 — the strict, deterministic temporal/anchor/resolution
    // validator. Cross-checks the event_date the model committed to.
    const verdict = validateMarket({
      title: candidate.title,
      endTimeIso: candidate.end_time,
      eventDateIso: m.event_date ?? null,
      resolutionCriteria: candidate.resolution_criteria,
      resolutionSourceUrl: candidate.resolution_source_url,
      targetDataKey: candidate.target_data_key,
      requireResolution: true,
      nowMs,
    })

    if (!verdict.valid) {
      dropped.push(describeValidation(candidate.title, verdict))
      continue
    }
    built.push(candidate)
  }

  // ── Freshness gate #3 — hard ESPN verification for sports markets ───────────
  // The only gate that checks live real-world data: confirm the team actually
  // has a scheduled (not-yet-final) game. Re-anchor close time to the real game.
  const verifications = await verifySportsMarkets(built, nowMs)
  const final: GeneratedMarket[] = []
  for (const v of verifications) {
    if (!v.verified) {
      dropped.push(`espn: ${v.reason} — "${v.market.title}"`)
      continue
    }
    // Re-anchor close to the verified game time (+3h buffer for the final score),
    // clamped to the duration bounds. Makes the countdown reflect reality.
    if (v.eventDateIso) {
      const gameMs = Date.parse(v.eventDateIso)
      if (!Number.isNaN(gameMs)) {
        const closeMs = gameMs + 3 * 60 * 60 * 1000
        const minMs = nowMs + MARKET_DURATION.MIN_HOURS * 60 * 60 * 1000
        const maxMs = nowMs + MARKET_DURATION.MAX_HOURS * 60 * 60 * 1000
        v.market.end_time = new Date(Math.min(maxMs, Math.max(minMs, closeMs))).toISOString()
      }
    }
    final.push(v.market)
  }

  if (dropped.length > 0) {
    console.info(`[market-generator] dropped ${dropped.length}/${raw.length} markets at the freshness gates:\n  ${dropped.join('\n  ')}`)
  }

  return final
}
