/**
 * POST /api/markets/bulk-seed
 *
 * One-shot bulk insertion of predefined markets to guarantee ≥15 per category.
 * Auth: Bearer matching CRON_SECRET, or any authenticated user in dev.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { seedLiquidity, type MarketCategory } from '@/lib/liquidity'

const DAY = 24 * 60 * 60 * 1000

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString()
}

interface SeedMarket {
  title: string
  category: MarketCategory
  days: number
  resolution_criteria: string
}

const SEED_MARKETS: SeedMarket[] = [
  // ── SPORTS ──────────────────────────────────────────────────────────────────
  {
    title: 'Will Carlos Alcaraz win the 2026 French Open?',
    category: 'Sports',
    days: 14,
    resolution_criteria: 'Resolves YES if Carlos Alcaraz is declared the 2026 French Open singles champion.',
  },
  {
    title: 'Will Max Verstappen win the 2026 F1 Canadian Grand Prix?',
    category: 'Sports',
    days: 10,
    resolution_criteria: 'Resolves YES if Max Verstappen crosses the finish line first at the 2026 Canadian Grand Prix.',
  },
  {
    title: 'Will the Golden State Warriors make the 2026 NBA Playoffs?',
    category: 'Sports',
    days: 20,
    resolution_criteria: 'Resolves YES if the Golden State Warriors secure a postseason berth in the 2025-26 NBA season.',
  },
  {
    title: 'Will Caitlin Clark average over 25 PPG in the 2026 WNBA season?',
    category: 'Sports',
    days: 60,
    resolution_criteria: 'Resolves YES if Caitlin Clark finishes the 2026 WNBA regular season with a points-per-game average above 25.',
  },
  {
    title: 'Will the New York Yankees lead the AL East by July 4th?',
    category: 'Sports',
    days: 32,
    resolution_criteria: 'Resolves YES if the New York Yankees hold first place in the American League East division standings on July 4, 2026.',
  },
  {
    title: 'Will Erling Haaland win the 2025-26 Premier League Golden Boot?',
    category: 'Sports',
    days: 18,
    resolution_criteria: 'Resolves YES if Erling Haaland finishes as the Premier League top scorer for the 2025-26 season.',
  },
  {
    title: 'Will Real Madrid win the 2025-26 UEFA Champions League?',
    category: 'Sports',
    days: 8,
    resolution_criteria: 'Resolves YES if Real Madrid are declared the 2025-26 UEFA Champions League champions.',
  },
  {
    title: 'Will Scottie Scheffler win the 2026 US Open golf?',
    category: 'Sports',
    days: 22,
    resolution_criteria: 'Resolves YES if Scottie Scheffler wins the 2026 US Open Championship in golf.',
  },
  {
    title: 'Will Argentina qualify for the 2026 World Cup knockout stage?',
    category: 'Sports',
    days: 45,
    resolution_criteria: 'Resolves YES if Argentina advances past the FIFA 2026 World Cup group stage.',
  },
  {
    title: 'Will LeBron James play in the 2026 NBA Finals?',
    category: 'Sports',
    days: 25,
    resolution_criteria: 'Resolves YES if LeBron James appears in at least one 2026 NBA Finals game.',
  },
  {
    title: 'Will Novak Djokovic win a Grand Slam in 2026?',
    category: 'Sports',
    days: 90,
    resolution_criteria: 'Resolves YES if Novak Djokovic wins any of the four 2026 Grand Slam tennis tournaments.',
  },
  {
    title: 'Will Lando Norris win the 2026 Monaco Grand Prix?',
    category: 'Sports',
    days: 28,
    resolution_criteria: 'Resolves YES if Lando Norris wins the 2026 Formula 1 Monaco Grand Prix.',
  },
  {
    title: 'Will the Los Angeles Dodgers have the best record in baseball by July 1?',
    category: 'Sports',
    days: 29,
    resolution_criteria: 'Resolves YES if the Los Angeles Dodgers have the best win-loss record in all of MLB on July 1, 2026.',
  },
  {
    title: 'Will Doncic lead the Mavericks to a playoff series win in 2026?',
    category: 'Sports',
    days: 15,
    resolution_criteria: 'Resolves YES if Luka Doncic and the Dallas Mavericks win at least one playoff series in the 2025-26 NBA postseason.',
  },
  {
    title: 'Will the 2026 Champions League final draw over 100 million TV viewers?',
    category: 'Sports',
    days: 9,
    resolution_criteria: 'Resolves YES if official UEFA viewership data confirms the 2026 Champions League final was watched by over 100 million people globally.',
  },
  {
    title: 'Will a female athlete break the 100m world record at the 2026 World Athletics?',
    category: 'Sports',
    days: 75,
    resolution_criteria: 'Resolves YES if the official 100m women\'s world record is broken at the 2026 World Athletics Championships.',
  },
  {
    title: 'Will Conor McGregor have a UFC fight announced before September 2026?',
    category: 'Sports',
    days: 90,
    resolution_criteria: 'Resolves YES if the UFC officially announces a fight card featuring Conor McGregor with a date before September 1, 2026.',
  },
  {
    title: 'Will the Chicago Bulls win the NBA Draft Lottery in 2026?',
    category: 'Sports',
    days: 12,
    resolution_criteria: 'Resolves YES if the Chicago Bulls win the 2026 NBA Draft Lottery and receive the #1 overall pick.',
  },

  // ── POLITICS ─────────────────────────────────────────────────────────────────
  {
    title: 'Will the US Federal Reserve cut interest rates in July 2026?',
    category: 'Politics',
    days: 50,
    resolution_criteria: 'Resolves YES if the Federal Reserve announces a federal funds rate cut at its July 2026 FOMC meeting.',
  },
  {
    title: 'Will the US Congress pass a new immigration bill before August 2026?',
    category: 'Politics',
    days: 60,
    resolution_criteria: 'Resolves YES if both chambers of US Congress pass new immigration legislation and it is signed into law before August 1, 2026.',
  },
  {
    title: 'Will the US and Iran reach a formal nuclear agreement in 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if the US and Iran sign a formal written nuclear deal with verifiable terms by December 31, 2026.',
  },
  {
    title: 'Will Donald Trump\'s approval rating exceed 50% by September 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if any major polling aggregator shows Donald Trump\'s approval rating above 50% in September 2026.',
  },
  {
    title: 'Will the UK hold a snap general election before the end of 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if the UK Prime Minister calls a general election with a polling date before December 31, 2026.',
  },
  {
    title: 'Will the US pass AI regulation legislation in 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if the US Congress passes and the President signs comprehensive federal AI regulation legislation before December 31, 2026.',
  },
  {
    title: 'Will NATO add a new member state in 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if NATO officially accepts a new member state during 2026.',
  },
  {
    title: 'Will any G7 economy officially enter a recession in 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if any G7 nation reports two consecutive quarters of negative GDP growth in official 2026 data.',
  },
  {
    title: 'Will Elon Musk\'s DOGE advisory role continue past October 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if Elon Musk is still publicly affiliated with the Department of Government Efficiency in an advisory capacity after October 1, 2026.',
  },
  {
    title: 'Will a US state ban TikTok independently in 2026?',
    category: 'Politics',
    days: 75,
    resolution_criteria: 'Resolves YES if any US state passes and enacts legislation banning TikTok within state borders by December 31, 2026.',
  },
  {
    title: 'Will Emmanuel Macron face a formal vote of no confidence in 2026?',
    category: 'Politics',
    days: 60,
    resolution_criteria: 'Resolves YES if the French National Assembly holds a formal vote of no confidence against the current government by December 31, 2026.',
  },
  {
    title: 'Will the US debt ceiling be raised without a government shutdown this year?',
    category: 'Politics',
    days: 45,
    resolution_criteria: 'Resolves YES if the US Congress raises or suspends the debt ceiling in 2026 without triggering a government shutdown.',
  },
  {
    title: 'Will China impose new tariffs on US goods before July 2026?',
    category: 'Politics',
    days: 30,
    resolution_criteria: 'Resolves YES if China officially announces new import tariffs specifically targeting US-made goods before July 1, 2026.',
  },
  {
    title: 'Will the US Supreme Court issue a ruling on AI copyright in 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if the US Supreme Court issues a formal ruling directly addressing AI-generated content and copyright law in 2026.',
  },
  {
    title: 'Will a major US city declare a climate emergency in 2026?',
    category: 'Politics',
    days: 60,
    resolution_criteria: 'Resolves YES if any US city with a population over 500,000 officially declares a climate emergency in 2026.',
  },
  {
    title: 'Will Germany hold an early federal election in 2026?',
    category: 'Politics',
    days: 90,
    resolution_criteria: 'Resolves YES if Germany calls and holds a snap federal election in 2026 outside the scheduled 2025 cycle.',
  },

  // ── CULTURE ──────────────────────────────────────────────────────────────────
  {
    title: 'Will GTA VI launch before September 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Grand Theft Auto VI is officially released on any platform before September 1, 2026.',
  },
  {
    title: 'Will Taylor Swift announce a new album before the end of 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Taylor Swift officially announces a new studio album by December 31, 2026.',
  },
  {
    title: 'Will a Marvel film gross over $1 billion at the box office in 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if any Marvel Cinematic Universe film released in 2026 reaches $1 billion in global box office revenue.',
  },
  {
    title: 'Will Netflix lose subscribers in Q2 2026?',
    category: 'Culture',
    days: 45,
    resolution_criteria: 'Resolves YES if Netflix\'s official Q2 2026 earnings report shows a net decline in total global subscribers.',
  },
  {
    title: 'Will Beyoncé perform at the 2027 Super Bowl halftime show?',
    category: 'Culture',
    days: 30,
    resolution_criteria: 'Resolves YES if the NFL officially announces Beyoncé as the 2027 Super Bowl halftime show headliner.',
  },
  {
    title: 'Will Drake release a new studio album in 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Drake releases a new full-length studio album available on major streaming platforms before December 31, 2026.',
  },
  {
    title: 'Will Apple release a new AI-native Siri before end of 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Apple ships a major Siri update powered by a large language model to all iOS devices by December 31, 2026.',
  },
  {
    title: 'Will Stranger Things Season 5 be renewed for a Season 6?',
    category: 'Culture',
    days: 60,
    resolution_criteria: 'Resolves YES if Netflix officially announces a Season 6 of Stranger Things by December 31, 2026.',
  },
  {
    title: 'Will a video game adaptation win an Emmy in 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if a TV series or film adaptation of a video game wins an Emmy Award at the 2026 Emmy ceremony.',
  },
  {
    title: 'Will Meta\'s AR glasses ship to general consumers before 2027?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Meta\'s Orion AR glasses are available for public purchase at retail or online by December 31, 2026.',
  },
  {
    title: 'Will Sabrina Carpenter headline Coachella 2027?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Sabrina Carpenter is officially announced as a Coachella 2027 headliner.',
  },
  {
    title: 'Will any AI-generated song hit #1 on the Billboard Hot 100 in 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if a song primarily composed or performed by AI reaches #1 on the US Billboard Hot 100 chart in 2026.',
  },
  {
    title: 'Will the next iPhone include a foldable display option?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Apple announces an iPhone model with a foldable or rollable display at its September 2026 event.',
  },
  {
    title: 'Will Elon Musk\'s X platform rebrand again in 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Elon Musk announces a new name or branding overhaul for the X (formerly Twitter) platform by December 31, 2026.',
  },
  {
    title: 'Will the 2026 Oscars Best Picture be a streaming-first film?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if the 2026 Academy Award for Best Picture is awarded to a film that premiered on a streaming platform rather than in theaters.',
  },
  {
    title: 'Will a deepfake scandal involving a world leader go viral before August 2026?',
    category: 'Culture',
    days: 60,
    resolution_criteria: 'Resolves YES if a fabricated deepfake video featuring a sitting head of government goes viral (100M+ views) before August 1, 2026.',
  },
  {
    title: 'Will Kendrick Lamar release a follow-up album to GNX in 2026?',
    category: 'Culture',
    days: 90,
    resolution_criteria: 'Resolves YES if Kendrick Lamar releases a new studio album after GNX by December 31, 2026.',
  },
]

export async function POST(request: Request) {
  // Auth: cron secret or authenticated user in dev
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Deduplicate against existing markets
  const { data: existing } = await supabase
    .from('markets')
    .select('title')

  const existingTitles = new Set((existing ?? []).map((m) => m.title.toLowerCase()))
  const toInsert = SEED_MARKETS.filter(
    (m) => !existingTitles.has(m.title.toLowerCase())
  )

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, message: 'All seed markets already exist.' })
  }

  const rows = toInsert.map((m) => {
    const seed = seedLiquidity(m.category, false)
    return {
      title: m.title,
      category: m.category,
      end_time: daysFromNow(m.days),
      resolution_criteria: m.resolution_criteria,
      resolution_source_url: null,
      target_data_key: null,
      jackpot_pool: 0,
      resolved: false,
      ...seed,
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (supabase as any)
    .from('markets')
    .insert(rows)
    .select('id, title, category')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts = { Sports: 0, Politics: 0, Culture: 0 }
  for (const m of inserted ?? []) {
    if (m.category in counts) counts[m.category as keyof typeof counts]++
  }

  return NextResponse.json({
    inserted: (inserted ?? []).length,
    skipped: SEED_MARKETS.length - toInsert.length,
    by_category: counts,
  })
}
