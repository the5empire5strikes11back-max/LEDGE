/**
 * Interest Tags System
 *
 * Maps user interests (chosen via quiz or inferred from bets) to market titles.
 * Used to boost personally relevant markets in the feed.
 *
 * Interests are subcategory-level — more specific than Sports/Culture/Politics.
 * They work alongside the existing category affinity system.
 */

// ── Selectable interest options (shown in the onboarding quiz) ────────────────

export interface InterestOption {
  id: string
  label: string
  emoji: string
  group: 'sports' | 'culture' | 'politics'
}

export const INTEREST_OPTIONS: InterestOption[] = [
  // Sports
  { id: 'basketball', label: 'Basketball',     emoji: '🏀', group: 'sports'   },
  { id: 'nfl',        label: 'NFL',             emoji: '🏈', group: 'sports'   },
  { id: 'soccer',     label: 'Soccer',          emoji: '⚽', group: 'sports'   },
  { id: 'baseball',   label: 'Baseball',        emoji: '⚾', group: 'sports'   },
  { id: 'combat',     label: 'MMA / Boxing',    emoji: '🥊', group: 'sports'   },
  { id: 'tennis',     label: 'Tennis / Golf',   emoji: '🎾', group: 'sports'   },
  // Culture
  { id: 'music',      label: 'Music',           emoji: '🎵', group: 'culture'  },
  { id: 'movies',     label: 'Movies',          emoji: '🎬', group: 'culture'  },
  { id: 'tv',         label: 'TV & Streaming',  emoji: '📺', group: 'culture'  },
  { id: 'gaming',     label: 'Gaming',          emoji: '🎮', group: 'culture'  },
  { id: 'celebrity',  label: 'Celebrity Drama', emoji: '✨', group: 'culture'  },
  // Politics
  { id: 'politics',   label: 'Politics',        emoji: '🗳️', group: 'politics' },
]

// ── Keyword → interest tag mapping ───────────────────────────────────────────
// Each array is a list of lowercase substrings. If any appear in a market title,
// the market is tagged with that interest.

const KEYWORDS: Record<string, string[]> = {
  basketball: [
    'nba', 'lakers', 'celtics', 'warriors', 'knicks', 'bucks', 'bulls',
    'heat', 'nets', 'thunder', 'nuggets', 'suns', 'sixers', '76ers',
    'mavs', 'mavericks', 'rockets', 'clippers', 'blazers', 'hawks',
    'basketball', 'lebron', 'curry', 'durant', 'giannis', 'luka',
    'nba finals', 'nba playoffs', 'nba draft', 'game 7',
  ],
  nfl: [
    'nfl', 'super bowl', 'chiefs', 'eagles', 'patriots', 'cowboys',
    'packers', '49ers', 'niners', 'ravens', 'bengals', 'bills', 'dolphins',
    'steelers', 'bears', 'giants', 'jets', 'saints', 'broncos', 'seahawks',
    'mahomes', 'brady', 'gridiron', 'nfl draft', 'nfl playoffs',
    'american football', 'nfl season',
  ],
  soccer: [
    'premier league', 'champions league', 'epl', 'la liga', 'serie a',
    'bundesliga', 'ligue 1', 'world cup', 'euro', 'copa del rey',
    'arsenal', 'chelsea', 'manchester city', 'man city', 'manchester united',
    'man utd', 'liverpool', 'tottenham', 'real madrid', 'barcelona', 'atletico',
    'juventus', 'ac milan', 'inter milan', 'psg', 'messi', 'ronaldo', 'mbappe',
    'haaland', 'de bruyne', 'premier league title', 'fa cup',
  ],
  baseball: [
    'mlb', 'yankees', 'dodgers', 'mets', 'red sox', 'cubs', 'astros',
    'braves', 'phillies', 'padres', 'giants', 'cardinals',
    'baseball', 'world series', 'home run', 'no-hitter', 'perfect game',
    'mlb playoffs', 'alds', 'alcs', 'nlcs', 'nlds',
  ],
  combat: [
    'ufc', 'mma', 'boxing', 'knockout', 'ko', 'tko', 'submission',
    'title fight', 'championship bout', 'belts', 'heavyweight', 'welterweight',
    'conor', 'mcgregor', 'fury', 'usyk', 'canelo', 'fight night',
    'ppv', 'main event', 'rematch',
  ],
  tennis: [
    'wimbledon', 'us open', 'french open', 'roland garros', 'australian open',
    'atp', 'wta', 'grand slam', 'tennis', 'djokovic', 'alcaraz', 'sinner',
    'federer', 'nadal', 'serena', 'swiatek',
    'pga', 'masters', 'ryder cup', 'us open golf', 'the open', 'golf',
    'tiger', 'mcilroy', 'scheffler',
  ],
  music: [
    'album', 'billboard', 'grammy', 'rapper', 'singer', 'artist',
    'chart', 'single', 'spotify', 'apple music', 'tour', 'concert',
    'music video', 'debut album', 'drop', 'new music', 'track',
    'number one', 'top 40', 'hot 100', 'streaming',
    'taylor swift', 'drake', 'beyoncé', 'beyonce', 'kanye', 'ye',
    'travis scott', 'bad bunny', 'sza', 'kendrick', 'nicki', 'cardi',
  ],
  movies: [
    'box office', 'movie', 'film', 'oscars', 'oscar', 'academy award',
    'sequel', 'marvel', 'dc comics', 'disney', 'pixar', 'trailer',
    'premiere', 'opening weekend', 'blockbuster', 'weekend gross',
    'golden globe', 'bafta', 'cannes',
  ],
  tv: [
    'netflix', 'hbo', 'disney+', 'hulu', 'prime video', 'peacock',
    'season finale', 'finale', 'new season', 'renewed', 'cancelled',
    'reality tv', 'reality show', 'bachelor', 'survivor', 'big brother',
    'series', 'emmy', 'sitcom', 'drama series',
  ],
  gaming: [
    'gaming', 'esports', 'twitch', 'gta 6', 'gta vi', 'fortnite',
    'call of duty', 'warzone', 'valorant', 'league of legends',
    'steam', 'ps5', 'xbox', 'nintendo switch', 'pc gaming',
    'tournament', 'esport', 'streamer', 'content creator',
  ],
  celebrity: [
    'beef', 'feud', 'drama', 'breakup', 'split', 'dating', 'relationship',
    'wedding', 'engaged', 'cheating', 'affair', 'cancelled', 'cancels',
    'cancel culture', 'controversial', 'controversy', 'goes viral',
    'diss track', 'claps back', 'responds to', 'shades',
  ],
  politics: [
    'election', 'president', 'congress', 'senate', 'house of representatives',
    'vote', 'poll', 'approval rating', 'campaign', 'democrat', 'republican',
    'white house', 'legislation', 'bill passes', 'executive order',
    'impeach', 'supreme court', 'attorney general', 'midterm',
  ],
}

// ── Core detection function ───────────────────────────────────────────────────

/**
 * Detect interest tags from a market title.
 * Returns the list of matching interest IDs (e.g. ["basketball", "nba_finals"]).
 */
export function detectMarketTags(title: string): string[] {
  const lower = title.toLowerCase()
  const matched: string[] = []
  for (const [tag, keywords] of Object.entries(KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      matched.push(tag)
    }
  }
  return matched
}

/**
 * Score how well a market matches a user's interest list.
 * Returns 1.0 for a match, 0.0 for no match.
 * (Binary — a market either fits your interests or it doesn't.)
 */
export function scoreInterestMatch(marketTitle: string, userInterests: string[]): number {
  if (userInterests.length === 0) return 0.5  // no preferences set → neutral
  const tags = detectMarketTags(marketTitle)
  if (tags.length === 0) return 0.4            // untagged market → slight penalty
  const hasMatch = tags.some((t) => userInterests.includes(t))
  return hasMatch ? 1.0 : 0.15                  // strong boost for match, deprioritise non-match
}

/**
 * Infer interests from a user's bet history by looking at market titles.
 * Returns tags that appear in at least MIN_BETS bets — these are genuine patterns.
 * Used for continuous learning: interests grow as the user bets.
 */
const MIN_BETS_TO_INFER = 2

export function inferInterestsFromBets(
  betHistory: Array<{ markets?: { title: string } | null }>
): string[] {
  const tagCounts = new Map<string, number>()
  for (const bet of betHistory) {
    const title = bet.markets?.title ?? ''
    for (const tag of detectMarketTags(title)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(tagCounts.entries())
    .filter(([, count]) => count >= MIN_BETS_TO_INFER)
    .map(([tag]) => tag)
}

/**
 * Merge quiz-set interests with bet-inferred interests.
 * Quiz interests take precedence; inferred ones fill the gaps.
 */
export function mergeInterests(quizInterests: string[], inferredInterests: string[]): string[] {
  return [...new Set([...quizInterests, ...inferredInterests])]
}
