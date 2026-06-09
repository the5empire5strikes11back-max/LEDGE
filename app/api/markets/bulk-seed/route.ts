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

  // ── TECH ─────────────────────────────────────────────────────────────────────
  {
    title: 'Will OpenAI release GPT-5 before October 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if OpenAI publicly releases a model officially named GPT-5 before October 1, 2026.',
  },
  {
    title: 'Will Apple ship Apple Intelligence to all iPhones before July 2026?',
    category: 'Tech',
    days: 30,
    resolution_criteria: 'Resolves YES if Apple rolls out its Apple Intelligence AI features to all eligible iPhone models globally before July 1, 2026.',
  },
  {
    title: 'Will Google\'s Gemini Ultra outperform GPT-4o on the MMLU benchmark by August 2026?',
    category: 'Tech',
    days: 60,
    resolution_criteria: 'Resolves YES if an independently verified benchmark report shows Google Gemini Ultra scoring higher than GPT-4o on the MMLU dataset by August 1, 2026.',
  },
  {
    title: 'Will Tesla\'s Full Self-Driving reach Level 4 autonomy approval in the US in 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if a US federal or state regulator officially certifies Tesla FSD at SAE Level 4 autonomy for any road conditions by December 31, 2026.',
  },
  {
    title: 'Will Meta release a standalone AI assistant device in 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if Meta announces and begins shipping a dedicated AI hardware assistant product (not glasses, not phone) by December 31, 2026.',
  },
  {
    title: 'Will Anthropic raise another funding round over $1 billion in 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if Anthropic closes a publicly announced funding round of $1 billion or more during 2026.',
  },
  {
    title: 'Will Bitcoin hit $150,000 before the end of 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if Bitcoin (BTC) reaches a spot price of $150,000 USD on any major exchange before December 31, 2026.',
  },
  {
    title: 'Will Elon Musk\'s xAI surpass OpenAI in total funding raised by 2027?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if publicly reported total funding for xAI exceeds total publicly reported funding for OpenAI before January 1, 2027.',
  },
  {
    title: 'Will a self-driving robotaxi service launch in New York City before 2027?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if a commercial driverless robotaxi service (Waymo, Tesla, or competitor) launches paid rides to the public in NYC before January 1, 2027.',
  },
  {
    title: 'Will Apple\'s Vision Pro 2 ship in 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if Apple announces and begins shipping a second-generation Vision Pro headset before December 31, 2026.',
  },
  {
    title: 'Will Nvidia\'s market cap surpass $4 trillion in 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if Nvidia\'s stock market capitalization officially crosses $4 trillion USD at any point during 2026.',
  },
  {
    title: 'Will a major AI lab announce AGI by the end of 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if OpenAI, Google DeepMind, Anthropic, or xAI publicly declares they have achieved Artificial General Intelligence (AGI) by December 31, 2026.',
  },
  {
    title: 'Will TikTok\'s US ban be permanently enforced before September 2026?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if TikTok is permanently blocked from US app stores and existing installations without a sale or legal resolution before September 1, 2026.',
  },
  {
    title: 'Will Ethereum flip Bitcoin in market cap before 2027?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if Ethereum\'s total market cap exceeds Bitcoin\'s total market cap on any major crypto tracker before January 1, 2027.',
  },
  {
    title: 'Will Microsoft Copilot replace standard Office features in the free tier by 2027?',
    category: 'Tech',
    days: 90,
    resolution_criteria: 'Resolves YES if Microsoft integrates Copilot AI features into its free Microsoft 365 tier (no paid subscription required) before January 1, 2027.',
  },

  // ── VIRAL ────────────────────────────────────────────────────────────────────
  {
    title: 'Will a TikTok trend cause a brand to go viral for the wrong reasons in July 2026?',
    category: 'Viral',
    days: 30,
    resolution_criteria: 'Resolves YES if a Fortune 500 brand faces a viral TikTok backlash or boycott trend that trends on the platform for 3+ consecutive days in July 2026.',
  },
  {
    title: 'Will the most-liked TikTok of 2026 be from a creator with under 1M followers?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if the single most-liked TikTok video of 2026 was posted by an account with under 1 million followers at the time of posting.',
  },
  {
    title: 'Will a meme format from 2026 still be used unironically in 2027?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if a meme format that originated in 2026 is still in widespread unironic use on social media platforms in January 2027.',
  },
  {
    title: 'Will MrBeast hit 400 million YouTube subscribers before 2027?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if MrBeast\'s main YouTube channel reaches 400 million subscribers before January 1, 2027.',
  },
  {
    title: 'Will a celebrity Twitter/X post cause a stock to move more than 5% in 2026?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if a single tweet or X post by a verified celebrity causes a publicly traded company\'s stock to move more than 5% in the same trading session in 2026.',
  },
  {
    title: 'Will a reality TV contestant go viral enough to trend globally in 2026?',
    category: 'Viral',
    days: 60,
    resolution_criteria: 'Resolves YES if a reality TV contestant from a 2026 season trends on X/Twitter globally for 24+ consecutive hours during or after their season.',
  },
  {
    title: 'Will a YouTube video from 2026 surpass 500 million views within 30 days of posting?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if any YouTube video uploaded in 2026 reaches 500 million views within 30 days of its upload date.',
  },
  {
    title: 'Will "demure" still be in mainstream internet vocabulary by September 2026?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if the word "very demure" is still used in new viral social media content (not ironically referencing the original trend) in September 2026.',
  },
  {
    title: 'Will a brand go viral for actually good reasons in Q3 2026?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if a major brand\'s social media campaign trends globally for positive reasons during Q3 2026 (July–September).',
  },
  {
    title: 'Will a TikTok sound hit 10 million uses in under 48 hours in 2026?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if TikTok\'s official trending data or a credible report confirms a sound reached 10 million video uses within 48 hours of going viral in 2026.',
  },
  {
    title: 'Will an AI-generated influencer reach 10 million social followers in 2026?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if a publicly disclosed AI-generated or AI-operated social media persona reaches 10 million followers on any single platform before December 31, 2026.',
  },
  {
    title: 'Will a Twitch stream in 2026 break the all-time concurrent viewers record?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if any Twitch live stream in 2026 surpasses the current all-time peak concurrent viewer record of approximately 3.4 million.',
  },
  {
    title: 'Will the most viral video of 2026 come from X/Twitter rather than TikTok?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if the single video judged most viral of 2026 by major media outlets originated on X/Twitter rather than TikTok, Instagram Reels, or YouTube Shorts.',
  },
  {
    title: 'Will a political debate moment go more viral than any sports clip in 2026?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if the most-shared political debate clip of 2026 receives more total cross-platform shares than the most-shared sports moment clip of 2026.',
  },
  {
    title: 'Will a viral challenge cause a major brand to pull an ad campaign in 2026?',
    category: 'Viral',
    days: 90,
    resolution_criteria: 'Resolves YES if a brand with over $1 billion in annual revenue publicly pulls an advertising campaign in response to a viral social media challenge or backlash in 2026.',
  },

  // ── WILD ─────────────────────────────────────────────────────────────────────
  {
    title: 'Will it snow in Los Angeles before the end of 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if the National Weather Service reports measurable snowfall (0.1 inches or more) anywhere within the Los Angeles city limits before December 31, 2026.',
  },
  {
    title: 'Will a major fast food chain release a completely AI-designed menu item in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if McDonald\'s, Burger King, Wendy\'s, Taco Bell, or Chick-fil-A publicly launches a menu item it claims was designed primarily by AI before December 31, 2026.',
  },
  {
    title: 'Will any country ban social media for users under 18 in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if any country with a population over 5 million passes and enforces a law banning social media access for users under 18 years old in 2026.',
  },
  {
    title: 'Will a sitting US senator post something that goes viral on TikTok in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if a currently serving US senator posts a video on TikTok that reaches 5 million views before December 31, 2026.',
  },
  {
    title: 'Will anyone break the world record for the longest continuous video game session in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if a Guinness World Records-certified attempt breaks the current longest continuous gaming session record in 2026.',
  },
  {
    title: 'Will a major airline announce fully electric short-haul flights for passengers by 2027?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if a commercially operating airline announces scheduled fully electric passenger flights (not hybrid) on routes under 500 miles before January 1, 2027.',
  },
  {
    title: 'Will anyone publicly bet $1 million or more on a prediction market in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if a verifiable report confirms a single user placed a bet of $1 million USD or equivalent on any prediction market platform in 2026.',
  },
  {
    title: 'Will a US city officially rename a street after a TikTok star in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if any US municipality officially renames or dedicates a street, park, or public space in honor of a social media creator primarily known for TikTok before December 31, 2026.',
  },
  {
    title: 'Will a human beat an AI at chess in a rated tournament game in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if a human player defeats a top-rated AI chess engine (Stockfish, AlphaZero, or equivalent) in a formally rated tournament game in 2026.',
  },
  {
    title: 'Will a robot complete a full marathon before the end of 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if a legged robot completes a full 26.2-mile marathon course without human assistance before December 31, 2026.',
  },
  {
    title: 'Will a country legalize recreational use of a currently Schedule I substance in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if any country with a population over 10 million fully legalizes recreational use of a drug currently classified as Schedule I (or equivalent) before December 31, 2026.',
  },
  {
    title: 'Will a college student\'s AI-written thesis get them expelled in 2026?',
    category: 'Wild',
    days: 60,
    resolution_criteria: 'Resolves YES if a major university publicly confirms expelling a student specifically for submitting an AI-generated thesis before December 31, 2026.',
  },
  {
    title: 'Will any language go extinct in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if UNESCO or a credible linguistic organization declares any language officially extinct (last native speaker deceased) during 2026.',
  },
  {
    title: 'Will Elon Musk officially run for US political office in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if Elon Musk files official candidacy paperwork to run for any elected US political office before December 31, 2026.',
  },
  {
    title: 'Will a professional sports team be purchased by an AI company in 2026?',
    category: 'Wild',
    days: 90,
    resolution_criteria: 'Resolves YES if a majority stake in any professional sports franchise in a major league (NFL, NBA, MLB, NHL, Premier League) is acquired by a company whose primary business is AI before December 31, 2026.',
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

  const counts: Record<string, number> = { Sports: 0, Politics: 0, Culture: 0, Tech: 0, Viral: 0, Wild: 0 }
  for (const m of inserted ?? []) {
    if (m.category in counts) counts[m.category]++
  }

  return NextResponse.json({
    inserted: (inserted ?? []).length,
    skipped: SEED_MARKETS.length - toInsert.length,
    by_category: counts,
  })
}
