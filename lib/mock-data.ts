import type { RankKey } from "@/components/user-profile-card"
import type { BetRecord } from "@/lib/game-engine"

export type MarketCategory = "Sports" | "Politics" | "Culture" | "Circle"

export interface Market {
  id: string
  title: string
  category: MarketCategory
  endTime: Date
  yesPercent: number
  totalCredits: number
  jackpotPool?: number
  userBet?: { side: "yes" | "no"; amount: number }
  resolved?: { winner: "yes" | "no" }
}

export const CURRENT_USER = {
  id: "me",
  username: "seb",
  rank: "analyst" as RankKey,
  credits: 18900,
  winRate: 61,
  streak: 5,
  xp: 2100,
  xpToNextRank: 3500,
  dailyDropAmount: 500,
  rankMultiplier: 2,
  streakBonus: 150,
  daysSinceActive: 0,
  vetoes: 1,
}

export const BET_HISTORY: BetRecord[] = [
  { category: "Sports", side: "yes", majorityWas: "yes", won: true },
  { category: "Sports", side: "yes", majorityWas: "yes", won: true },
  { category: "Sports", side: "no", majorityWas: "yes", won: false },
  { category: "Sports", side: "yes", majorityWas: "no", won: true },
  { category: "Politics", side: "no", majorityWas: "no", won: true },
  { category: "Politics", side: "yes", majorityWas: "yes", won: false },
  { category: "Culture", side: "yes", majorityWas: "yes", won: true },
  { category: "Culture", side: "no", majorityWas: "yes", won: false },
  { category: "Sports", side: "yes", majorityWas: "yes", won: true },
  { category: "Circle", side: "yes", majorityWas: "yes", won: true },
]

export const MARKETS: Market[] = [
  {
    id: "m1",
    title: "Will the Lakers beat the Warriors tonight?",
    category: "Sports",
    endTime: new Date(Date.now() + 4 * 60 * 60 * 1000 + 22 * 60 * 1000),
    yesPercent: 62,
    totalCredits: 124500,
    jackpotPool: 18000,
  },
  {
    id: "m2",
    title: "Will Congress pass the AI Safety Bill this month?",
    category: "Politics",
    endTime: new Date(Date.now() + 72 * 60 * 60 * 1000),
    yesPercent: 34,
    totalCredits: 892000,
    jackpotPool: 125000,
  },
  {
    id: "m3",
    title: "Will Drake drop a surprise album before summer?",
    category: "Culture",
    endTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
    yesPercent: 45,
    totalCredits: 567000,
    userBet: { side: "yes", amount: 250 },
  },
  {
    id: "m4",
    title: "Will Jake win the fantasy league this week?",
    category: "Circle",
    endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    yesPercent: 78,
    totalCredits: 15600,
    userBet: { side: "no", amount: 100 },
  },
  {
    id: "m5",
    title: "Will the Fed cut rates at the next meeting?",
    category: "Politics",
    endTime: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    yesPercent: 57,
    totalCredits: 2340000,
    jackpotPool: 340000,
  },
  {
    id: "m6",
    title: "Will Kendrick release new music this month?",
    category: "Culture",
    endTime: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    yesPercent: 41,
    totalCredits: 456000,
  },
  {
    id: "m7",
    title: "Will the Chiefs make the Super Bowl next year?",
    category: "Sports",
    endTime: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    yesPercent: 68,
    totalCredits: 3200000,
    jackpotPool: 750000,
  },
  {
    id: "m8",
    title: "Will Bella text first after the party?",
    category: "Circle",
    endTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    yesPercent: 33,
    totalCredits: 8400,
    userBet: { side: "yes", amount: 500 },
  },
  // Resolved markets
  {
    id: "r1",
    title: "Did Tesla hit $300 by April?",
    category: "Politics",
    endTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
    yesPercent: 72,
    totalCredits: 445000,
    userBet: { side: "yes", amount: 800 },
    resolved: { winner: "yes" },
  },
  {
    id: "r2",
    title: "Will Super Bowl MVP go to a receiver?",
    category: "Sports",
    endTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
    yesPercent: 58,
    totalCredits: 1200000,
    userBet: { side: "no", amount: 300 },
    resolved: { winner: "yes" },
  },
]

export const CIRCLES = [
  {
    id: "c1",
    circleName: "College Homies",
    members: [
      { id: "1", username: "alpha_jake", rank: "oracle" as RankKey, credits: 24500, weeklyChange: 3200, previousPosition: 2 },
      { id: "2", username: "seb", rank: "analyst" as RankKey, credits: 18900, weeklyChange: -1400, isCurrentUser: true, wasOvertaken: true, previousPosition: 1 },
      { id: "3", username: "betting_bella", rank: "forecaster" as RankKey, credits: 15600, weeklyChange: 890, previousPosition: 3 },
      { id: "4", username: "mike_markets", rank: "forecaster" as RankKey, credits: 12300, weeklyChange: 450 },
      { id: "5", username: "crypto_chris", rank: "rookie" as RankKey, credits: 8900, weeklyChange: -200, previousPosition: 6 },
      { id: "6", username: "newbie_nat", rank: "rookie" as RankKey, credits: 4500, weeklyChange: 1200, previousPosition: 5 },
    ],
  },
  {
    id: "c2",
    circleName: "Trading Legends",
    members: [
      { id: "1", username: "whale_master", rank: "juryLead" as RankKey, credits: 892000, weeklyChange: 45000 },
      { id: "2", username: "market_maker_max", rank: "marketMaker" as RankKey, credits: 567000, weeklyChange: 23000 },
      { id: "3", username: "oracle_olivia", rank: "oracle" as RankKey, credits: 245000, weeklyChange: 12000 },
      { id: "4", username: "seb", rank: "analyst" as RankKey, credits: 89000, weeklyChange: 5600, isCurrentUser: true },
    ],
  },
]

export const GLOBAL_LEADERBOARD = [
  { rank: 1, username: "cryptoqueen", credits: 45670, winRate: 78, pnl: 124.5, streak: 12 },
  { rank: 2, username: "alphatrader", credits: 38900, winRate: 72, pnl: 89.2, streak: 7 },
  { rank: 3, username: "moonshot", credits: 32100, winRate: 68, pnl: 67.8, streak: 0 },
  { rank: 4, username: "seb", credits: 18900, winRate: 62, pnl: 24.3, streak: 5, isCurrentUser: true },
  { rank: 5, username: "whale_watcher", credits: 11200, winRate: 58, pnl: 18.9, streak: 0 },
]
