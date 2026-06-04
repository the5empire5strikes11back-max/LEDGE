import Anthropic from '@anthropic-ai/sdk'

// ── RSS Feeds ────────────────────────────────────────────────────────────────
// Curated for Gen Z relevance: sports drama, entertainment, celebrity, gaming,
// viral culture. Business/finance feed REMOVED — it produced corporate garbage.

const RSS_FEEDS = [
  // Sports — two major sources for game outcomes + drama
  { url: 'https://www.espn.com/espn/rss/news',               category: 'Sports'   },
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml',           category: 'Sports'   },
  { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',  category: 'Sports'   },

  // Entertainment / celebrity — high social discussability
  { url: 'https://variety.com/feed/',                        category: 'Culture'  },
  { url: 'https://deadline.com/feed/',                       category: 'Culture'  },
  { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', category: 'Culture' },

  // Music — artist drama, chart battles, drops
  { url: 'https://www.billboard.com/feed/',                  category: 'Culture'  },

  // Gaming + tech culture — viral moments, releases
  { url: 'https://www.theverge.com/rss/index.xml',           category: 'Culture'  },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'Culture'  },

  // Politics — only breaking / emotionally charged stories
  { url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', category: 'Politics' },
]

export interface GeneratedMarket {
  title: string
  category: 'Sports' | 'Politics' | 'Culture'
  end_time: string
  jackpot_pool: number
  resolution_criteria: string
  resolution_source_url: string
  target_data_key: string
}

export interface GenerationOptions {
  /**
   * When true, bias generation toward ~48% Sports / 27% Culture / 25% Politics.
   * Triggered automatically when Sports inventory (live + queued) falls below threshold.
   */
  sportsHeavy?: boolean
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

  const distributionInstruction = options.sportsHeavy
    ? `CATEGORY DISTRIBUTION (Sports inventory critically low — boost Sports now):
- Sports: ~20 markets (50%) — game winners, series outcomes, player moments, tournament runs
- Culture: ~12 markets (30%) — celebrity drama, music drops, movie box office, viral events
- Politics: ~8 markets (20%) — only genuinely polarising, high-stakes, emotionally charged stories
All Sports markets MUST use hours_until_close of 12–48 to match real game timelines.`
    : `CATEGORY DISTRIBUTION (balanced — 15 per category target):
- Sports: ~14 markets (35%) — game outcomes, player performance, match results
- Culture: ~15 markets (37%) — entertainment, awards, celebrity beef, music, viral moments
- Politics: ~11 markets (28%) — only hot-button, viral, emotionally charged political events
Sports markets should strongly prefer hours_until_close of 12–48.`

  const prompt = `You are generating prediction markets for Ledge — a Gen Z social betting app (fake credits, no real money).

Today is ${now.toDateString()}.

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

Generate exactly 40 yes/no prediction market questions based on these headlines. Requirements:
- Must be decidable within 1–7 days from today
- Exciting and personally relevant to Gen Z
- Natural, conversational language — like a bet you'd make with your friend
- Do NOT ask about things that already happened
- Be PRECISE about timing — a game tonight closes in hours, not days

${distributionInstruction}

Return ONLY a JSON array, no other text:
[
  {
    "title": "Will the Lakers beat the Celtics tonight?",
    "category": "Sports",
    "hours_until_close": 8,
    "jackpot_pool": 50000,
    "resolution_criteria": "YES if Lakers win per official NBA box score.",
    "resolution_source_url": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
    "target_data_key": "{\"type\":\"espn_game\",\"team\":\"LAL\",\"condition\":\"win\"}"
  }
]

Rules:
- category must be "Sports", "Politics", or "Culture"
- hours_until_close: use 4–12 for events today, 24–48 for tomorrow, up to 168 (7 days) max
- jackpot_pool must be 10000–500000
- resolution_criteria: one precise sentence defining exactly what makes this YES vs NO

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
resolution_source_url — pick the most topically relevant feed:
  - US politics: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml"
  - World events: "https://feeds.bbci.co.uk/news/world/rss.xml"
  - Entertainment: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml"
  - Tech/gaming: "https://feeds.bbci.co.uk/news/technology/rss.xml"
target_data_key: {"type":"rss_keyword","yes_terms":["<phrase1>","<phrase2>"],"no_terms":["<phrase3>","<phrase4>"]}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 12000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`)

  const raw = JSON.parse(jsonMatch[0]) as Array<{
    title: string
    category: string
    hours_until_close: number
    jackpot_pool: number
    resolution_criteria: string
    resolution_source_url?: string
    target_data_key?: string
  }>

  return raw.map((m) => {
    const endTime = new Date(now)
    const hours = Math.max(4, Math.min(168, m.hours_until_close ?? 24))
    endTime.setTime(endTime.getTime() + hours * 60 * 60 * 1000)
    return {
      title: m.title,
      category: m.category as GeneratedMarket['category'],
      end_time: endTime.toISOString(),
      jackpot_pool: Math.max(10000, m.jackpot_pool),
      resolution_criteria: m.resolution_criteria ?? 'Resolves YES or NO based on official results.',
      resolution_source_url: m.resolution_source_url ?? '',
      target_data_key: m.target_data_key ?? '',
    }
  })
}
