import Anthropic from '@anthropic-ai/sdk'

const RSS_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', category: 'Sports' },
  { url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', category: 'Politics' },
  { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', category: 'Culture' },
  { url: 'https://www.espn.com/espn/rss/news', category: 'Sports' },
  { url: 'https://variety.com/feed/', category: 'Culture' },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'Culture' },
  { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', category: 'Sports' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'Politics' },
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
  // Match <title> tags, skip the first one (feed title)
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

  // Category distribution instruction — changes when Sports inventory is low
  const distributionInstruction = options.sportsHeavy
    ? `CATEGORY DISTRIBUTION (Sports inventory is critically low — boost Sports now):
- Sports: ~12 markets (48%) — prioritize game outcomes, match results, player performance, tournament results
- Culture: ~7 markets (28%) — entertainment, awards, viral moments
- Politics: ~6 markets (24%) — legislation, elections, policy
All Sports markets MUST use hours_until_close of 12-48 to match real game timelines.`
    : `CATEGORY DISTRIBUTION (balanced):
- Sports: ~9 markets (36%) — game outcomes, match results, player performance
- Culture: ~8 markets (32%) — entertainment, awards, pop culture moments
- Politics: ~8 markets (32%) — legislation, elections, geopolitics
Sports markets should strongly prefer hours_until_close of 12-48 (games don't take weeks).`

  const prompt = `You are generating prediction markets for a Gen Z social betting app called Ledge (fake credits, no real money).

Today is ${now.toDateString()}.

Here are today's news headlines:
${headlines.map((h, i) => `${i + 1}. [${h.category}] ${h.headline}`).join('\n')}

Generate exactly 25 yes/no prediction market questions based on these headlines. Requirements:
- Must be decidable within 1-7 days from today
- Exciting and relevant to Gen Z (sports, politics, pop culture)
- Natural language, like something people would actually bet on
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
- hours_until_close: use 4-12 for games/events happening today, 24-48 for tomorrow, up to 168 (7 days) for weekly events
- jackpot_pool must be 10000-500000
- resolution_criteria: one sentence defining exactly what makes this YES vs NO

RESOLUTION STRATEGY — choose in strict priority order. Use the highest tier available.

━━ TIER 1 — espn_game ━━ (use for ANY market about a team winning a specific game)
Match the sport to the correct ESPN scoreboard endpoint and provide the 2-3 letter team abbreviation.
- NBA: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
- NFL: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
- MLB: "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard"
- NHL: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard"
- EPL soccer: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard"
- La Liga: "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard"
- Champions League: "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard"
target_data_key: {"type":"espn_game","team":"<ABBR>","condition":"win"}
NBA abbreviations: LAL BOS GSW MIA CHI NYK PHX DEN MIL PHI BKN LAC DAL HOU ATL
NFL abbreviations: NE KC DAL SF GB BUF BAL CIN PHI LAR MIA DEN CHI NYG SEA

━━ TIER 2 — json_field ━━ (use when a free, auth-free JSON API returns a checkable field)
Use this for non-game sports outcomes, rankings, or any market where a public endpoint holds the answer.
Examples:
- F1 race completed: "https://api.openf1.org/v1/sessions?session_name=Race&year=2025"
  target_data_key: {"type":"json_field","path":"0.session_key","yes_value":"<known_key>"}
- Crypto milestone (BTC above threshold): "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
  target_data_key: {"type":"json_field","path":"bitcoin.usd","yes_value":"<threshold_string>"}
- Wikipedia factual check: "https://en.wikipedia.org/api/rest_v1/page/summary/<Topic_Name>"
  target_data_key: {"type":"json_field","path":"type","yes_value":"standard"}
Only use json_field when you are certain the field value will be an exact string match.

━━ TIER 3 — rss_keyword ━━ (LAST RESORT — only when no structured API exists)
Use ONLY for politics, legislation, culture, and entertainment markets with no machine-readable API.
RULES FOR KEYWORDS — violations cause false resolutions:
  • Each term MUST be a multi-word phrase, never a single common word.
    BAD:  "yes_terms": ["passes", "win"]        ← these appear in unrelated headlines
    GOOD: "yes_terms": ["bill passes Senate", "signed into law", "Trump signs"]
  • Each term must be so specific that only a headline directly about THIS market would contain it.
  • Supply 2-4 terms per side. More is not better — precision beats quantity.
  • no_terms must be equally specific (e.g. "bill fails", "vetoed by", "vote rejected").
resolution_source_url — pick the most topically relevant BBC RSS feed:
  - US politics/legislation: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml"
  - World events: "https://feeds.bbci.co.uk/news/world/rss.xml"
  - Entertainment/awards: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml"
  - Tech/AI announcements: "https://feeds.bbci.co.uk/news/technology/rss.xml"
  - Economy/earnings: "https://feeds.bbci.co.uk/news/business/rss.xml"
target_data_key: {"type":"rss_keyword","yes_terms":["<phrase1>","<phrase2>"],"no_terms":["<phrase3>","<phrase4>"]}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 8192,
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
