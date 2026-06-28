"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, useTransition } from "react"
import { MarketFeedCard } from "@/components/market-feed-card"
import { MarketGroupCard } from "@/components/market-group-card"
import { PollCard } from "@/components/poll-card"
import type { GroupType } from "@/lib/market-groups"
import { BetModal } from "@/components/bet-modal"
import { MarketDetail } from "@/components/market-detail"
import { FeedTooltip } from "@/components/onboarding/feed-tooltip"
import { PostBetPanel } from "@/components/onboarding/post-bet-panel"
import { DailyChallenges } from "@/components/daily-challenges"
import { CreateMarketSheet } from "@/components/create-market-sheet"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Plus, Flame, Star, ChevronLeft, Search, X as XIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { pushOddsPoint, seedOddsHistory, type OddsPoint } from "@/lib/odds-history"
import { useOnboarding } from "@/lib/onboarding"
import { rankFeedFirstSession, buildAffinityMap } from "@/lib/feed-ranker"
import { computeCompoundState } from "@/lib/feed-signals"
import { useSessionArc, formatCloseTime } from "@/lib/session-arc"
import { isLive, formatTimeLeft } from "@/lib/market-live"
import type { CompoundState, IdentitySignal } from "@/lib/feed-signals"
import type { Persona } from "@/lib/game-engine"

type Category = "All" | "Live" | "Sports" | "Politics" | "Culture" | "Tech" | "Viral" | "Wild" | "Circle"

const ALL_TABS: Category[] = ["All", "Live", "Sports", "Politics", "Culture", "Tech", "Viral", "Wild", "Circle"]
// Circle and Live are hidden on first session
const FIRST_SESSION_TABS: Category[] = ["All", "Sports", "Politics", "Culture", "Tech", "Viral", "Wild"]

// Subcategory chips shown below the active tab (client-side filter on title keywords)
const SUBCATEGORIES: Partial<Record<Category, string[]>> = {
  Sports:   ["NBA", "NFL", "Soccer", "UFC", "Esports"],
  Culture:  ["Music", "Movies", "TV", "Gaming", "Celebrity"],
  Tech:     ["AI", "Big Tech", "Crypto", "Science"],
  Viral:    ["TikTok", "Twitter", "Memes", "YouTube"],
  Politics: ["US", "World", "Elections"],
}

// Keywords used to match markets to subcategories
const SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
  NBA:       ["nba", "lakers", "celtics", "warriors", "lebron", "curry", "basketball"],
  NFL:       ["nfl", "super bowl", "touchdown", "quarterback", "chiefs", "patriots", "football"],
  Soccer:    ["soccer", "premier league", "mls", "champions league", "world cup", "fifa", "messi", "ronaldo"],
  UFC:       ["ufc", "mma", "conor", "fight", "knockout", "boxing"],
  Esports:   ["esports", "valorant", "league of legends", "fortnite", "twitch", "gaming"],
  Music:     ["music", "album", "tour", "grammy", "spotify", "drake", "taylor", "beyonce", "rapper", "artist"],
  Movies:    ["movie", "film", "oscar", "box office", "sequel", "marvel", "disney", "netflix"],
  TV:        ["show", "season", "episode", "hbo", "netflix", "streaming", "series", "reality"],
  Gaming:    ["game", "playstation", "xbox", "nintendo", "steam", "gta", "call of duty"],
  Celebrity: ["celebrity", "kardashian", "beef", "drama", "dating", "breakup", "scandal"],
  AI:        ["ai", "gpt", "openai", "anthropic", "claude", "gemini", "llm", "model", "robot"],
  "Big Tech":["apple", "google", "meta", "microsoft", "amazon", "zuckerberg", "musk", "tesla"],
  Crypto:    ["bitcoin", "crypto", "ethereum", "btc", "eth", "coin", "blockchain", "nft"],
  Science:   ["nasa", "space", "climate", "science", "research", "study", "discovery"],
  TikTok:    ["tiktok", "tik tok", "fyp", "creator", "viral"],
  Twitter:   ["twitter", "x.com", "tweet", "elon", "trending"],
  Memes:     ["meme", "memes", "trend", "challenge", "ratio"],
  YouTube:   ["youtube", "youtuber", "subscriber", "views", "channel"],
  US:        ["biden", "trump", "congress", "senate", "house", "democrat", "republican", "white house"],
  World:     ["china", "russia", "uk", "europe", "nato", "president", "prime minister", "election"],
  Elections: ["election", "vote", "ballot", "candidate", "poll", "primary"],
}

import type { MarketSocialData } from "@/lib/social-signals"

interface FriendBet {
  username: string
  avatarUrl: string | null
  side: string
}

interface Market {
  id: string
  title: string
  category: "Sports" | "Politics" | "Culture" | "Tech" | "Viral" | "Wild" | "Circle"
  endTime: string
  yesPercent: number
  yesPool: number
  noPool: number
  totalCredits: number
  hotScore?: number
  momentumShift?: number
  isFeatured?: boolean
  isNearMiss?: boolean
  /** AI-set opening probability from virtual pools — used for "AI est." vs "Crowd" label */
  openingYesPercent?: number
  /** Resolution source URL — used for "Resolves via …" chip */
  resolutionSourceUrl?: string | null
  /** Raw JSON resolution key — used to derive source label & type */
  targetDataKey?: string | null
  /** User-coined category label shown in place of the system category */
  subcategory?: string | null
  social?: MarketSocialData | null
  userBet?: { side: "yes" | "no"; amount: number; payout?: number | null; shares?: number | null; value?: number | null }
  autoBet?: { id: string; side: "yes" | "no"; targetPercent: number; amount: number }
  resolutionMode?: "auto" | "creator"
  creatorProposedWinner?: "yes" | "no" | null
  creatorResolvedAt?: string | null
  isCreator?: boolean
  resolved?: {
    winner: "yes" | "no"
    note?: string | null
    sourceUrl?: string | null
    resolvedAt?: string | null
  }
  resolutionCriteria?: string | null
  creatorUsername?: string | null
  friendBets?: FriendBet[]
  /** Multi-option grouping — null for standalone Yes/No markets */
  groupId?: string | null
  groupLabel?: string | null
  optionLabel?: string | null
  groupType?: GroupType | "poll"
  groupExclusive?: boolean
}

interface PostBetInfo {
  marketTitle: string
  endTime: Date
  side: "yes" | "no"
  amount: number
  currentOdds: number
}

interface TradeModal {
  market: Market
  side: "yes" | "no"
}

interface FeedScreenProps {
  availableCredits: number
  streak: number
  decay: "none" | "warning" | "critical"
  /** User's current persona */
  persona?: Persona | null
  /** Bet history for category affinity ranking */
  betHistory?: Array<{ category: string; won: boolean }>
  onBet: (
    marketTitle: string,
    marketCategory: string,
    side: "yes" | "no",
    amount: number,
    yesPercent: number,
    majorityWas: "yes" | "no",
    serverCredits?: number,
    serverXp?: number,
    marketEndTime?: string,
  ) => void
  onWin: (
    marketTitle: string,
    marketCategory: string,
    bet: { side: "yes" | "no"; amount: number },
    payout: number
  ) => void
  /** Open the credit shop modal */
  onOpenShop?: () => void
  /** Fired when the first-bet post-bet panel is dismissed — releases the next queued celebration */
  onFirstBetFlowDone?: () => void
  /** Update the app-level credit balance after a cash-out */
  onCashout?: (newCredits: number) => void
  onUsernameClick?: (username: string) => void
  currentUsername?: string | null
  currentAvatarUrl?: string | null
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return value.toString()
}

/** Human-readable "closes in X" string for bet toasts */
function formatResolveTime(endTime: string): string {
  const ms = new Date(endTime).getTime() - Date.now()
  if (ms <= 0) return "closing soon"
  const mins  = Math.floor(ms / 60_000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days >= 1)  return `closes in ${days}d`
  if (hours >= 1) return `closes in ${hours}h`
  return `closes in ${mins}m`
}

export function FeedScreen({
  availableCredits,
  streak,
  decay,
  persona = null,
  betHistory = [],
  onBet,
  onWin,
  onOpenShop,
  onFirstBetFlowDone,
  onCashout,
  onUsernameClick,
  currentUsername,
  currentAvatarUrl,
}: FeedScreenProps) {
  const [activeTab, setActiveTab] = useState<Category>("All")
  const [activeSubcat, setActiveSubcat] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [detailMarket, setDetailMarket] = useState<Market | null>(null)
  const [tradeModal, setTradeModal] = useState<TradeModal | null>(null)
  const [postBetInfo, setPostBetInfo] = useState<PostBetInfo | null>(null)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const { state: ob, complete: completeOb } = useOnboarding()

  // First-session: user hasn't placed a bet yet
  const isFirstSession = !ob.firstBetAchievementDone
  // The user belongs to ≥1 circle when any circle market is in their feed
  // (the API only returns circle markets to members). When so, always surface
  // the "Circle" tab — even in first session — so circle predictions are
  // reachable from the dashboard the moment one exists.
  const hasCircleMarkets = useMemo(
    () => markets.some((m) => m.category === "Circle"),
    [markets]
  )
  const TABS = useMemo(() => {
    const base = [...(isFirstSession ? FIRST_SESSION_TABS : ALL_TABS)]
    if (hasCircleMarkets && !base.includes("Circle")) base.push("Circle")
    return base
  }, [isFirstSession, hasCircleMarkets])

  // Session arc — tracks emotional phase of this session
  const { arc, recordBet: arcRecordBet, recordInteraction } = useSessionArc()

  // ── Odds history — stored in a ref (Map), never causes re-renders on push.
  // A separate version counter forces cards to re-read the ref when new points
  // arrive from Realtime. We increment per-market so only affected cards update.
  const oddsHistoryRef = useRef<Map<string, OddsPoint[]>>(new Map())
  const [oddsVersion, setOddsVersion] = useState<Map<string, number>>(new Map())

  const supabase = useRef(createClient())

  const loadMarkets = useCallback(async () => {
    // Fire both pipeline steps in parallel — resolve expired AND drip-release
    // queued markets. release-markets is rate-limited server-side (2h) so it's
    // safe to call on every feed load without spamming the DB.
    await Promise.allSettled([
      fetch('/api/markets/resolve-expired', { method: 'POST' }),
      fetch('/api/cron/release-markets', { method: 'POST' }),
    ])
    const res = await fetch('/api/markets')
    if (res.ok) {
      const data: Market[] = await res.json()
      setMarkets(data)
      // Seed opening + current point per market so sparklines show the full arc
      seedOddsHistory(
        oddsHistoryRef.current,
        data.map((m) => ({
          id: m.id,
          yesPercent: m.yesPercent,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          openingYesPercent: (m as any).openingYesPercent,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          published_at: (m as any).published_at,
        }))
      )

      // Fetch friend bets in background — fire-and-forget, updates cards when ready
      const ids = data.map((m) => m.id).join(',')
      fetch(`/api/markets/friend-bets?ids=${ids}`)
        .then((r) => r.ok ? r.json() : {})
        .then((fbMap: Record<string, FriendBet[]>) => {
          setMarkets((prev) => prev.map((m) =>
            fbMap[m.id] ? { ...m, friendBets: fbMap[m.id] } : m
          ))
        })
        .catch(() => {})
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadMarkets()
  }, [loadMarkets])

  // Deep link: ?m=<marketId> auto-opens the market detail on load
  useEffect(() => {
    if (loading || markets.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const marketId = params.get("m")
    if (!marketId) return
    const found = markets.find((m) => m.id === marketId)
    if (found) {
      setDetailMarket(found)
      // Clean up the URL without a full navigation
      const url = new URL(window.location.href)
      url.searchParams.delete("m")
      window.history.replaceState({}, "", url.toString())
    }
  }, [loading, markets])

  // ── Supabase Realtime — live odds + history accumulation
  useEffect(() => {
    const channel = supabase.current
      .channel('market-odds')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markets' },
        (payload) => {
          const updated = payload.new as {
            id: string
            yes_percent: number
            yes_pool: number
            no_pool: number
            total_credits: number
            hot_score: number
            momentum_shift: number
            resolved: boolean
            winner: string | null
          }

          // Push new odds point into the history ring
          pushOddsPoint(oddsHistoryRef.current, updated.id, updated.yes_percent)

          // Bump per-market version so the card reading from the ref re-renders
          setOddsVersion((prev) => {
            const next = new Map(prev)
            next.set(updated.id, (prev.get(updated.id) ?? 0) + 1)
            return next
          })

          const patch = {
            yesPercent: updated.yes_percent,
            yesPool: updated.yes_pool,
            noPool: updated.no_pool,
            totalCredits: updated.total_credits,
            hotScore: updated.hot_score,
            momentumShift: updated.momentum_shift,
            resolved: updated.resolved && updated.winner
              ? { winner: updated.winner as "yes" | "no" }
              : undefined,
          }
          setMarkets((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...patch } : m))
          setDetailMarket((prev) => prev?.id === updated.id ? { ...prev, ...patch } : prev)
        }
      )
      .subscribe()

    return () => { supabase.current.removeChannel(channel) }
  }, [])



  // Markets the user has bet on stay in the feed as open-position cards —
  // hiding them reads as a bug ("where did my market go?"). They also appear
  // in Profile > Bets Made.
  const rawFiltered = activeTab === "All"
    ? markets
    : activeTab === "Live"
    ? markets.filter((m) => !m.resolved && isLive(m.endTime))
    : markets.filter((m) => m.category === activeTab)

  // Apply subcategory filter using keyword matching on market title
  const subcatFiltered = activeSubcat
    ? rawFiltered.filter((m) => {
        const keywords = SUBCATEGORY_KEYWORDS[activeSubcat] ?? []
        const title = m.title.toLowerCase()
        return keywords.some((kw) => title.includes(kw))
      })
    : rawFiltered

  // Apply search filter
  const searchTrimmed = searchQuery.trim().toLowerCase()
  const searchFiltered = searchTrimmed
    ? subcatFiltered.filter((m) => m.title.toLowerCase().includes(searchTrimmed))
    : subcatFiltered

  // Apply first-session ranking to All tab when user hasn't bet yet
  const filtered = (isFirstSession && activeTab === "All" && !searchTrimmed)
    ? rankFeedFirstSession(
        searchFiltered.map((m) => ({
          ...m,
          // Map Market fields to RankableMarket fields
          created_at: new Date(0).toISOString(), // approximation; not stored on Market
          end_time: m.endTime,
          resolved: !!m.resolved,
          is_featured: m.isFeatured ?? false,
          yes_percent: m.yesPercent,
          hot_score: m.hotScore ?? 0,
          momentum_shift: m.momentumShift ?? 0,
          total_credits: m.totalCredits,
          circle_id: null,
        }))
      ).map((ranked) => searchFiltered.find((m) => m.id === ranked.id)!)
    : searchFiltered

  // Spotlight: first hot/featured open market for first-session users
  const spotlightId = (isFirstSession && activeTab === "All")
    ? filtered.find(
        (m) => !m.resolved && !m.userBet && ((m.hotScore ?? 0) >= 5 || m.isFeatured)
      )?.id ?? null
    : null

  // Screener stats
  const openMarkets = markets.filter((m) => !m.resolved)
  const totalVolume = markets.reduce((sum, m) => sum + m.totalCredits, 0)
  const hotCount = openMarkets.filter((m) => (m.hotScore ?? 0) >= 8).length
  // Live markets — event happening right now (close time ≤ 4h)
  const liveMarkets = useMemo(
    () => openMarkets.filter((m) => !m.userBet && isLive(m.endTime))
                     .sort((a, b) => (b.hotScore ?? 0) - (a.hotScore ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openMarkets]
  )
  const liveCount = liveMarkets.length

  // Ticker strip: top markets sorted by live-ness then hot score
  const tickerItems = useMemo(
    () => [...openMarkets]
      .sort((a, b) => {
        const aScore = (a.hotScore ?? 0) + (isLive(a.endTime) ? 20 : 0)
        const bScore = (b.hotScore ?? 0) + (isLive(b.endTime) ? 20 : 0)
        return bScore - aScore
      })
      .slice(0, 12),
    [openMarkets]
  )

  // Session arc derived — markets closing within 24h, top idle suggestion
  const closingTodayCount = useMemo(
    () => openMarkets.filter((m) => {
      const hoursLeft = (new Date(m.endTime).getTime() - Date.now()) / 3_600_000
      return hoursLeft > 0 && hoursLeft <= 24
    }).length,
    [openMarkets]
  )
  const idleSuggestion = filtered.find((m) => !m.resolved && !m.userBet) ?? null

  const openTrade = (market: Market, side: "yes" | "no") => {
    if (market.userBet || market.resolved) return
    // If user has no credits, open the shop instead
    if (availableCredits < 50) {
      onOpenShop?.()
      return
    }
    // Dismiss feed tooltip when user engages with a trade
    if (!ob.feedTooltipDone) completeOb("feedTooltipDone")
    setTradeModal({ market, side })
  }

  const handleBetSubmit = async (side: "yes" | "no", amount: number) => {
    const market = tradeModal?.market
    if (!market) return

    // Capture first-session status before any async ops
    const wasFirstBet = isFirstSession

    const majorityWas: "yes" | "no" = market.yesPercent >= 50 ? "yes" : "no"
    const creditsBeforeBet = availableCredits

    setTradeModal(null)

    onBet(market.title, market.category, side, amount, market.yesPercent, majorityWas, undefined, undefined, market.endTime)

    const res = await fetch('/api/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market_id: market.id, side, amount }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const errMsg = err?.error ?? `Server error (${res.status})`
      // Roll back optimistic credit deduction
      onBet(market.title, market.category, side, 0, market.yesPercent, majorityWas, creditsBeforeBet)
      // If out of credits, open the shop
      if (res.status === 400 && errMsg === 'Insufficient credits') {
        onOpenShop?.()
      } else {
        toast.error("Bet didn't go through", {
          description: errMsg === `Server error (${res.status})` ? 'Please try again.' : errMsg,
          duration: 4000,
        })
      }
      return
    }

    const data = await res.json()
    const placed = data?.cappedAmount ?? amount

    const patch = { userBet: { side, amount: placed } }
    setMarkets((prev) => prev.map((m) => m.id === market.id ? { ...m, ...patch } : m))
    setDetailMarket((prev) => prev?.id === market.id ? { ...prev, ...patch } : prev)

    if (data?.profile) {
      onBet(market.title, market.category, side, amount, market.yesPercent, majorityWas, data.profile.credits, data.profile.xp, market.endTime)
    }

    // Record bet in session arc — drives peaked phase + arc strip copy
    arcRecordBet(market.title, market.endTime, side)

    // Streak milestone celebration — when hitting 7 / 14 / 30-day streaks
    const STREAK_MILESTONES = [7, 14, 30, 60, 100]
    if (STREAK_MILESTONES.includes(streak + 1)) {
      toast(`🔥 ${streak + 1}-day streak!`, {
        description: `You've predicted ${streak + 1} days in a row. Keep it going.`,
        duration: 4000,
      })
    } else if (streak === 0 && decay !== "none") {
      // First bet after a streak break — gentle encouragement
      toast("Streak restarted 🔥", {
        description: "Day 1. Get to 7 days for a bonus reward.",
        duration: 3000,
      })
    }

    // Show anticipation panel on first bet
    if (wasFirstBet) {
      setPostBetInfo({
        marketTitle: market.title,
        endTime: new Date(market.endTime),
        side,
        amount: placed,
        currentOdds: market.yesPercent,
      })
    }
  }

  const handleArmAutoBet = async (side: "yes" | "no", amount: number, targetPercent: number) => {
    const market = tradeModal?.market
    if (!market) return
    setTradeModal(null)

    const res = await fetch('/api/auto-bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market_id: market.id, side, target_percent: targetPercent, amount }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const errMsg = err?.error ?? `Server error (${res.status})`
      if (res.status === 400 && errMsg === 'Insufficient credits') onOpenShop?.()
      else toast.error("Couldn't arm auto-bet", { description: errMsg, duration: 4000 })
      return
    }

    const data = await res.json()
    // Reflect the escrowed credits in the shell balance, and show the trigger.
    if (typeof data?.credits === 'number') onCashout?.(data.credits)
    const patch = { autoBet: { id: data?.autoBet?.id, side, targetPercent, amount } }
    setMarkets((prev) => prev.map((m) => m.id === market.id ? { ...m, ...patch } : m))
    setDetailMarket((prev) => prev?.id === market.id ? { ...prev, ...patch } : prev)

    toast(`🎯 Auto-bet armed`, {
      description: `Buys ${side.toUpperCase()} if it drops to ${targetPercent}% · ${amount.toLocaleString()} CR held`,
      duration: 4000,
    })
  }

  const handleCancelAutoBet = useCallback(async (marketId: string) => {
    const m = markets.find((mk) => mk.id === marketId) ?? (detailMarket?.id === marketId ? detailMarket : undefined)
    const autoBetId = (m as { autoBet?: { id: string } } | undefined)?.autoBet?.id
    if (!autoBetId) return
    const res = await fetch(`/api/auto-bets/${autoBetId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error("Couldn't cancel", { description: err?.error ?? 'Try again.', duration: 3000 })
      return
    }
    const data = await res.json()
    setMarkets((prev) => prev.map((mk) => mk.id === marketId ? { ...mk, autoBet: undefined } : mk))
    setDetailMarket((prev) => prev?.id === marketId ? { ...prev, autoBet: undefined } : prev)
    if (typeof data?.refunded === 'number') onCashout?.(availableCredits + data.refunded)
    toast(`Auto-bet cancelled · +${(data?.refunded ?? 0).toLocaleString()} CR back`, { duration: 3000 })
  }, [markets, detailMarket, availableCredits, onCashout])

  const openTradeFromDetail = (side: "yes" | "no") => {
    if (!detailMarket) return
    setTradeModal({ market: detailMarket, side })
  }

  const handleCashout = useCallback((marketId: string, newCredits: number, cashoutValue: number) => {
    // Close the position locally and bubble the new balance up to the app shell.
    setMarkets((prev) => prev.map((m) => m.id === marketId ? { ...m, userBet: undefined } : m))
    setDetailMarket((prev) => prev && prev.id === marketId ? { ...prev, userBet: undefined } : prev)
    onCashout?.(newCredits)
    toast(`Cashed out · +${cashoutValue.toLocaleString()} CR`, {
      description: "Position closed",
      duration: 3000,
      style: { background: "var(--card)", border: "1px solid var(--accent)", borderLeft: "3px solid var(--accent)", fontWeight: "700" },
    })
  }, [onCashout])

  // ── Feed column (shared by mobile full-width + desktop left column) ──────────
  const feedColumn = (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 w-full pb-24 lg:pb-20">
        {/* Screener stats bar */}
        <div className="bg-surface border-b border-border px-4 py-2.5 flex items-center gap-4 overflow-x-auto scrollbar-none">
          {isFirstSession ? (
            // New user: plain language, no jargon
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                <span className="font-mono font-bold text-foreground">{openMarkets.length}</span> predictions live now
              </span>
            </div>
          ) : (
            // Returning user: full stats
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  <span className="font-mono font-bold text-foreground">{openMarkets.length}</span> open
                </span>
              </div>
              <span className="text-border shrink-0">·</span>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  <span className="font-mono font-bold text-foreground">{formatCredits(totalVolume)}</span> CR vol
                </span>
              </div>
              {hotCount > 0 && (
                <>
                  <span className="text-border shrink-0">·</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="inline-flex items-center gap-1 text-[10px] text-orange-400 uppercase tracking-wider font-semibold">
                      <Flame className="w-3 h-3 shrink-0" /><span className="font-mono">{hotCount}</span> hot
                    </span>
                  </div>
                </>
              )}
              {streak >= 3 && decay === "none" && (
                <>
                  <span className="text-border shrink-0">·</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="inline-flex items-center gap-1 text-[10px] text-accent uppercase tracking-wider font-bold streak-flame-glow">
                      <Flame className="w-3 h-3 shrink-0 streak-flame" />
                      <span className="font-mono">{streak}</span>
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Live odds ticker — slim scrolling strip, Bloomberg-style ambient data */}
        {!isFirstSession && tickerItems.length >= 3 && (
          <div className="overflow-hidden border-b border-border/40 bg-surface h-7 flex items-center select-none">
            <div className="ticker-track">
              {/* Duplicate list for seamless infinite loop */}
              {[...tickerItems, ...tickerItems].map((m, i) => {
                // Show the YES chance consistently (matches the cards), not the
                // leading side — so the ticker never flips between YES/NO.
                const dominantPct = Math.round(m.yesPercent)
                const shift = m.momentumShift ?? 0
                const isLiveItem = isLive(m.endTime)
                return (
                  <React.Fragment key={`${m.id}-${i}`}>
                    <span className="flex items-center gap-1.5 px-3 text-[10px] font-mono whitespace-nowrap">
                      {/* Liveness dot */}
                      <span className={cn(
                        "w-1 h-1 rounded-full shrink-0",
                        isLiveItem
                          ? "bg-red-400 animate-pulse"
                          : (m.hotScore ?? 0) >= 8
                          ? "bg-accent"
                          : "bg-muted-foreground/20"
                      )} />
                      {/* Short title */}
                      <span className="text-muted-foreground/60">
                        {m.title.length > 24 ? `${m.title.slice(0, 24)}…` : m.title}
                      </span>
                      {/* YES chance — same meaning as the cards */}
                      <span className="font-black tabular-nums text-foreground">
                        {dominantPct}%
                      </span>
                      <span className="text-[9px] font-bold uppercase text-muted-foreground/40">
                        YES
                      </span>
                      {/* Momentum arrow — only when meaningful */}
                      {Math.abs(shift) >= 3 && (
                        <span className={cn(
                          "text-[9px]",
                          shift > 0 ? "text-success/70" : "text-danger/70"
                        )}>
                          {shift > 0 ? "↑" : "↓"}{Math.abs(shift).toFixed(1)}
                        </span>
                      )}
                    </span>
                    {/* Separator dot */}
                    <span className="text-border/40 text-[8px] shrink-0">·</span>
                  </React.Fragment>
                )
              })}
            </div>
          </div>
        )}

        {/* Session Arc strip — context-aware copy that shifts with session phase */}
        {!isFirstSession && arc.phase === "peaked" && arc.lastBet && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-accent/5 border-b border-accent/10">
            <span
              className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 animate-pulse"
              aria-hidden
            />
            <span className="text-[11px] text-accent font-semibold truncate">
              Bet in play
            </span>
            <span className="text-border shrink-0 text-[10px]">·</span>
            <span className="text-[11px] text-muted-foreground truncate flex-1">
              {arc.lastBet.marketTitle}
            </span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {formatCloseTime(arc.lastBet.marketEndTime)}
            </span>
          </div>
        )}
        {!isFirstSession && arc.phase === "idle" && idleSuggestion && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b border-border cursor-pointer hover:bg-secondary/50 transition-colors"
            onClick={() => { recordInteraction(); setDetailMarket(idleSuggestion) }}
          >
            <Star className="w-3 h-3 text-muted-foreground/60 shrink-0" aria-hidden="true" />
            <span className="text-[11px] text-muted-foreground font-medium">Top pick right now</span>
            <span className="text-border shrink-0 text-[10px]">·</span>
            <span className="text-[11px] text-foreground font-semibold truncate flex-1">
              {idleSuggestion.title}
            </span>
            <span className="text-[10px] text-muted-foreground/50 shrink-0">→</span>
          </div>
        )}

        {/* Daily Challenges — shown to returning users only */}
        {!isFirstSession && (
          <DailyChallenges />
        )}

        {/* ── Happening Now rail ───────────────────────────────────────────────
            Horizontal strip of live markets shown only on the All tab.
            Each chip is a compact tap-target that opens the market detail. */}
        {activeTab === "All" && !searchTrimmed && liveCount > 0 && (
          <div className="border-b border-border bg-red-500/3">
            <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                Happening Now
              </span>
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                {liveCount} live
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 pb-3 pt-1">
              {liveMarkets.slice(0, 8).map((m) => (
                <button
                  key={m.id}
                  onClick={() => { recordInteraction(); setDetailMarket(m) }}
                  className={cn(
                    "shrink-0 flex flex-col gap-1.5 w-[148px] px-3 py-2.5 text-left",
                    "bg-background border border-red-500/20 hover:border-red-500/40",
                    "active:scale-[0.96] transition-all duration-[80ms] ease-[var(--ease-sharp)]"
                  )}
                  style={{ borderRadius: "var(--radius-card)" }}
                >
                  {/* Title */}
                  <p className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2 min-h-[2.4em]">
                    {m.title}
                  </p>
                  {/* Stats row */}
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-sm font-black tabular-nums text-foreground">
                      {Math.round(m.yesPercent)}<span className="text-muted-foreground/60">% YES</span>
                    </span>
                    <span className="text-[9px] font-mono text-red-400/80 tabular-nums">
                      {formatTimeLeft(m.endTime)}
                    </span>
                  </div>
                  {/* Slim odds bar */}
                  <div className="h-0.5 bg-muted overflow-hidden w-full" style={{ borderRadius: "9999px" }}>
                    <div
                      className="h-full bg-success/60 transition-all duration-500"
                      style={{ width: `${m.yesPercent}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter tabs + subcategory chips */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">

          {/* Search bar */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search markets…"
                className="w-full bg-surface border border-border text-sm text-foreground placeholder:text-muted-foreground/40 pl-9 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-colors"
                style={{ borderRadius: "var(--radius-button)" }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Primary category tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none px-4 pt-2 pb-2.5">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setActiveSubcat(null) }}
                className={cn(
                  "relative shrink-0 px-3 py-2 text-xs font-semibold uppercase tracking-wider",
                  "transition-all duration-[80ms] ease-[var(--ease-sharp)] active:scale-[0.94]",
                  activeTab === tab
                    ? tab === "Live"
                      ? "bg-red-500 text-white"
                      : "bg-accent text-accent-foreground"
                    : tab === "Live" && liveCount > 0
                    ? "text-red-400 hover:text-red-300 hover:bg-red-500/10 active:bg-red-500/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary active:bg-muted"
                )}
                style={{ borderRadius: "var(--radius-badge)" }}
              >
                {tab === "Live" ? (
                  <span className="flex items-center gap-1.5">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      liveCount > 0 ? "bg-red-400 animate-pulse" : "bg-muted-foreground/40"
                    )} />
                    Live
                    {liveCount > 0 && (
                      <span className={cn(
                        "text-[9px] font-black px-1 py-0 leading-4",
                        activeTab === "Live"
                          ? "bg-white/20 text-white"
                          : "bg-red-500/15 text-red-400"
                      )} style={{ borderRadius: "3px" }}>
                        {liveCount}
                      </span>
                    )}
                  </span>
                ) : tab}
              </button>
            ))}
          </div>

          {/* Subcategory chips — only shown when a category with subs is active */}
          {SUBCATEGORIES[activeTab] && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 pb-2">
              {SUBCATEGORIES[activeTab]!.map((sub) => (
                <button
                  key={sub}
                  onClick={() => setActiveSubcat(activeSubcat === sub ? null : sub)}
                  className={cn(
                    "shrink-0 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider border",
                    "transition-all duration-[80ms] active:scale-[0.93]",
                    activeSubcat === sub
                      ? "bg-accent/15 text-accent border-accent/40"
                      : "text-muted-foreground/70 border-border hover:text-foreground hover:border-border/80"
                  )}
                  style={{ borderRadius: "var(--radius-badge)" }}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Streak urgency — for returning users with an active streak at risk */}
        {!isFirstSession && streak >= 2 && decay !== "none" && (
          <div className={cn(
            "flex items-center gap-2 px-4 py-2.5 border-b",
            decay === "critical"
              ? "bg-danger/5 border-danger/15"
              : "bg-accent/5 border-accent/10"
          )}>
            <Flame className={cn("w-3.5 h-3.5 shrink-0 streak-flame", decay === "critical" ? "text-danger" : "text-accent")} aria-hidden="true" />
            <span className={cn(
              "text-[11px] font-semibold",
              decay === "critical" ? "text-danger" : "text-accent"
            )}>
              {streak}-day streak —{" "}
              {decay === "critical"
                ? "bet today to stop rank decay"
                : "bet today to keep it going"}
            </span>
          </div>
        )}

        {/* Onboarding: feed tooltip — explains the core action to new users */}
        {!loading && filtered.length > 0 && !ob.feedTooltipDone && (
          <FeedTooltip
            visible
            onDismiss={() => completeOb("feedTooltipDone")}
          />
        )}

        {/* Markets */}
        <div className="w-full px-4 py-4 space-y-4">
          {loading ? (
            /* Skeleton cards — match real card structure */
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton-card p-5 space-y-4" style={{ animationDelay: `${i * 80}ms` }}>
                  {/* Row 1: category + time */}
                  <div className="flex items-center justify-between">
                    <div className="skeleton h-3 w-16" />
                    <div className="skeleton h-3 w-12" />
                  </div>
                  {/* Row 2: big number + title */}
                  <div className="flex items-start gap-4">
                    <div className="space-y-1 shrink-0">
                      <div className="skeleton h-9 w-12" style={{ borderRadius: "var(--radius-badge)" }} />
                      <div className="skeleton h-2.5 w-10" />
                      <div className="skeleton h-3.5 w-14 mt-1" style={{ borderRadius: "var(--radius-pill)" }} />
                    </div>
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="skeleton h-3.5 w-full" />
                      <div className="skeleton h-3.5 w-4/5" />
                      <div className="skeleton h-3.5 w-3/5" />
                    </div>
                  </div>
                  {/* Row 3: odds bar */}
                  <div className="skeleton h-1.5 w-full" style={{ borderRadius: "var(--radius-pill)" }} />
                  {/* Row 4: buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="skeleton h-10" style={{ borderRadius: "var(--radius-button)" }} />
                    <div className="skeleton h-10" style={{ borderRadius: "var(--radius-button)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
              <span className="text-3xl" aria-hidden>{searchTrimmed ? "🔍" : "🔭"}</span>
              <p className="text-sm font-medium text-foreground">
                {searchTrimmed ? "No results" : "Nothing here yet"}
              </p>
              <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
                {searchTrimmed
                  ? `No markets matching "${searchQuery}". Try different keywords.`
                  : activeSubcat
                  ? `No ${activeSubcat} markets right now.`
                  : activeTab === "All"
                  ? "New markets are added daily. Check back soon."
                  : activeTab === "Live"
                  ? "No events in-play right now. Check back when games kick off."
                  : `No ${activeTab} markets right now. Try another category or check back later.`}
              </p>
              {searchTrimmed ? (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-1 px-4 py-2 text-xs font-semibold bg-accent text-accent-foreground active:scale-[0.96] active:opacity-80 transition-all duration-[80ms]"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  Clear search
                </button>
              ) : activeSubcat ? (
                <button
                  onClick={() => setActiveSubcat(null)}
                  className="mt-1 px-4 py-2 text-xs font-semibold bg-accent text-accent-foreground active:scale-[0.96] active:opacity-80 transition-all duration-[80ms]"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  Clear filter
                </button>
              ) : activeTab !== "All" && (
                <button
                  onClick={() => setActiveTab("All")}
                  className="mt-1 px-4 py-2 text-xs font-semibold bg-accent text-accent-foreground active:scale-[0.96] active:opacity-80 transition-all duration-[80ms]"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  See all markets
                </button>
              )}
            </div>

          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4 lg:[&>*]:h-full">
            {(() => {
            const seenGroups = new Set<string>()
            return filtered.map((market, idx) => {
              // Multi-option group → one MarketGroupCard for the whole group
              if (market.groupId) {
                if (seenGroups.has(market.groupId)) return null
                seenGroups.add(market.groupId)
                const opts = filtered.filter((m) => m.groupId === market.groupId)
                if (market.groupType === "poll") {
                  return (
                    <PollCard
                      key={market.groupId}
                      className="card-enter"
                      style={{ animationDelay: `${Math.min(idx * 40, 200)}ms` } as React.CSSProperties}
                      groupId={market.groupId}
                      groupLabel={market.groupLabel ?? market.title}
                      category={market.subcategory || market.category}
                      endTime={new Date(market.endTime)}
                    />
                  )
                }
                return (
                  <MarketGroupCard
                    key={market.groupId}
                    className="card-enter"
                    style={{ animationDelay: `${Math.min(idx * 40, 200)}ms` } as React.CSSProperties}
                    groupLabel={market.groupLabel ?? market.title}
                    category={market.subcategory || market.category}
                    endTime={new Date(market.endTime)}
                    groupType={(market.groupType ?? "multiple_choice") as GroupType}
                    exclusive={market.groupExclusive ?? true}
                    resolutionSourceUrl={market.resolutionSourceUrl}
                    targetDataKey={market.targetDataKey}
                    options={opts.map((o) => ({
                      id: o.id,
                      optionLabel: o.optionLabel ?? o.title,
                      yesPercent: o.yesPercent,
                      userBet: o.userBet ?? null,
                      resolvedWinner: o.resolved?.winner ?? null,
                    }))}
                    onBetOption={(id) => { const om = markets.find((m) => m.id === id); if (om) { recordInteraction(); openTrade(om, "yes") } }}
                    onOpenOption={(id) => { const om = markets.find((m) => m.id === id); if (om) { recordInteraction(); setDetailMarket(om) } }}
                  />
                )
              }
              const isSpotlight = market.id === spotlightId
              // Pulse CTA buttons only when tooltip is still showing (no spotlight)
              const pulseCTA =
                !isSpotlight &&
                !ob.feedTooltipDone &&
                isFirstSession &&
                !market.userBet &&
                !market.resolved &&
                ((market.hotScore ?? 0) >= 8 || !!market.isFeatured) &&
                filtered.indexOf(market) === 0

              // Cross-system compound state: hot + momentum → surging, etc.
              const compoundState = computeCompoundState(
                market.hotScore ?? 0,
                market.momentumShift ?? 0,
                market.yesPercent,
                market.social
              )

              return (
                <MarketFeedCard
                  key={market.id}
                  className={cn("card-enter")}
                  style={{ animationDelay: `${Math.min(idx * 40, 200)}ms` } as React.CSSProperties}
                  {...market}
                  endTime={new Date(market.endTime)}
                  yesPool={market.yesPool ?? 0}
                  noPool={market.noPool ?? 0}
                  hotScore={market.hotScore ?? 0}
                  momentumShift={market.momentumShift ?? 0}
                  isFeatured={market.isFeatured ?? false}
                  isNearMiss={market.isNearMiss ?? false}
                  oddsHistory={oddsHistoryRef.current.get(market.id) ?? []}
                  oddsVersion={oddsVersion.get(market.id) ?? 0}
                  social={market.social}
                  isSpotlight={isSpotlight}
                  pulseCTA={pulseCTA}
                  compoundState={compoundState}
                  creatorUsername={market.creatorUsername ?? null}
                  friendBets={market.friendBets}
                  onClick={() => { recordInteraction(); setDetailMarket(market) }}
                  onBuyYes={() => { recordInteraction(); openTrade(market, "yes") }}
                  onBuyNo={() => { recordInteraction(); openTrade(market, "no") }}
                />
              )
            })
            })()}
            </div>
          )}
        </div>
      </div>

      {/* "+" FAB — create a market */}
      <button
        onClick={() => setCreateSheetOpen(true)}
        aria-label="Create a prediction market"
        className={cn(
          "fixed z-30 w-11 h-11 rounded-full bg-accent text-accent-foreground",
          "flex items-center justify-center shadow-lg",
          "hover:opacity-90 active:scale-95 transition-all duration-150",
          // Mobile: above bottom nav bar, right edge
          "right-4",
          // Desktop: bottom-right of the full-width feed grid
          "lg:right-6 lg:left-auto lg:bottom-6"
        )}
        style={{ bottom: "calc(65px + env(safe-area-inset-bottom) + 12px)" }}
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </button>
    </div>
  )

  return (
    <>
      {/* ── Desktop layout (lg+) — a full-width library of market cards;
            clicking a card opens it full-screen, with a back button to return. ── */}
      <div className="hidden lg:flex flex-col h-full overflow-hidden">
        {detailMarket ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Back bar — return to the market library */}
            <button
              onClick={() => setDetailMarket(null)}
              className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-border text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to markets
            </button>
            <div className="flex-1 overflow-hidden">
              <MarketDetail
                mode="panel"
                market={detailMarket}
                onClose={() => setDetailMarket(null)}
                onBuyYes={() => openTradeFromDetail("yes")}
                onBuyNo={() => openTradeFromDetail("no")}
                onCashout={handleCashout}
                onCancelAutoBet={handleCancelAutoBet}
                onUsernameClick={onUsernameClick}
                currentUsername={currentUsername}
                currentAvatarUrl={currentAvatarUrl}
              />
            </div>
          </div>
        ) : (
          feedColumn
        )}
      </div>

      {/* ── Mobile single-column layout (<lg) ──────────────────────────────── */}
      <div className="lg:hidden flex flex-col h-full w-full">
        {feedColumn}

        {/* Market detail — full-screen overlay on mobile */}
        {detailMarket && (
          <MarketDetail
            mode="overlay"
            market={detailMarket}
            onClose={() => setDetailMarket(null)}
            onBuyYes={() => openTradeFromDetail("yes")}
            onBuyNo={() => openTradeFromDetail("no")}
            onCashout={handleCashout}
            onCancelAutoBet={handleCancelAutoBet}
            onUsernameClick={onUsernameClick}
            currentUsername={currentUsername}
            currentAvatarUrl={currentAvatarUrl}
          />
        )}
      </div>

      {/* Bet / trade modal — shared across layouts */}
      {tradeModal && (
        <BetModal
          market={tradeModal.market}
          initialSide={tradeModal.side}
          availableCredits={availableCredits}
          onClose={() => setTradeModal(null)}
          onSubmit={handleBetSubmit}
          onArmAutoBet={handleArmAutoBet}
        />
      )}

      {/* Post-bet anticipation panel — first bet only */}
      {postBetInfo && (
        <PostBetPanel
          show={!!postBetInfo}
          marketTitle={postBetInfo.marketTitle}
          endTime={postBetInfo.endTime}
          userSide={postBetInfo.side}
          currentOdds={postBetInfo.currentOdds}
          amount={postBetInfo.amount}
          onDismiss={() => { setPostBetInfo(null); onFirstBetFlowDone?.() }}
        />
      )}

      {/* Create market sheet */}
      <CreateMarketSheet
        open={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onCreated={(isReview) => {
          if (isReview) {
            toast.info("Prediction submitted for review — it'll go live shortly if approved.")
          } else {
            toast.success("Prediction posted! 🎯 Others can now bet on it.")
            loadMarkets()
          }
        }}
      />
    </>
  )
}
