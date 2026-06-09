"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { MarketFeedCard } from "@/components/market-feed-card"
import { BetModal } from "@/components/bet-modal"
import { MarketDetail } from "@/components/market-detail"
import { FeedTooltip } from "@/components/onboarding/feed-tooltip"
import { PostBetPanel } from "@/components/onboarding/post-bet-panel"
import { ReturnHooksBar } from "@/components/onboarding/return-hooks-bar"
import { DailyChallenges } from "@/components/daily-challenges"
import { CreateMarketSheet } from "@/components/create-market-sheet"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Plus, Flame, Star, BarChart2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { pushOddsPoint, seedOddsHistory, type OddsPoint } from "@/lib/odds-history"
import { useOnboarding } from "@/lib/onboarding"
import { rankFeedFirstSession, buildAffinityMap } from "@/lib/feed-ranker"
import { computeCompoundState } from "@/lib/feed-signals"
import { useSessionArc, formatCloseTime } from "@/lib/session-arc"
import type { ReturnHook } from "@/app/api/return-hooks/route"
import type { CompoundState, IdentitySignal } from "@/lib/feed-signals"
import type { Persona } from "@/lib/game-engine"

type Category = "All" | "Sports" | "Politics" | "Culture" | "Tech" | "Viral" | "Wild" | "Circle"

const ALL_TABS: Category[] = ["All", "Sports", "Politics", "Culture", "Tech", "Viral", "Wild", "Circle"]
// Circle is hidden on first session — undefined concept for new users
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
  social?: MarketSocialData | null
  userBet?: { side: "yes" | "no"; amount: number }
  resolved?: { winner: "yes" | "no" }
  creatorUsername?: string | null
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
  onUsernameClick,
  currentUsername,
  currentAvatarUrl,
}: FeedScreenProps) {
  const [activeTab, setActiveTab] = useState<Category>("All")
  const [activeSubcat, setActiveSubcat] = useState<string | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [detailMarket, setDetailMarket] = useState<Market | null>(null)
  const [tradeModal, setTradeModal] = useState<TradeModal | null>(null)
  const [postBetInfo, setPostBetInfo] = useState<PostBetInfo | null>(null)
  const [returnHooks, setReturnHooks] = useState<ReturnHook[]>([])
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const { state: ob, complete: completeOb } = useOnboarding()

  // First-session: user hasn't placed a bet yet
  const isFirstSession = !ob.firstBetAchievementDone
  const TABS = isFirstSession ? FIRST_SESSION_TABS : ALL_TABS

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
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadMarkets()
  }, [loadMarkets])

  // Fetch return hooks for returning users (has placed a bet before)
  useEffect(() => {
    if (!ob.firstBetAchievementDone) return
    fetch('/api/return-hooks')
      .then((r) => r.ok ? r.json() : [])
      .then((hooks: ReturnHook[]) => setReturnHooks(hooks))
      .catch(() => {})
  }, [ob.firstBetAchievementDone])

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



  // Hide markets the user has already bet on — they move to Profile > Bets Made
  const unbetMarkets = markets.filter((m) => !m.userBet)

  const rawFiltered = activeTab === "All"
    ? unbetMarkets
    : unbetMarkets.filter((m) => m.category === activeTab)

  // Apply subcategory filter using keyword matching on market title
  const subcatFiltered = activeSubcat
    ? rawFiltered.filter((m) => {
        const keywords = SUBCATEGORY_KEYWORDS[activeSubcat] ?? []
        const title = m.title.toLowerCase()
        return keywords.some((kw) => title.includes(kw))
      })
    : rawFiltered

  // Apply first-session ranking to All tab when user hasn't bet yet
  const filtered = (isFirstSession && activeTab === "All")
    ? rankFeedFirstSession(
        subcatFiltered.map((m) => ({
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
      ).map((ranked) => subcatFiltered.find((m) => m.id === ranked.id)!)
    : subcatFiltered

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
        console.error('Bet failed:', errMsg)
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

    // Show anticipation panel on first bet
    if (wasFirstBet) {
      setPostBetInfo({
        marketTitle: market.title,
        endTime: new Date(market.endTime),
        side,
        amount: placed,
        currentOdds: market.yesPercent,
      })
    } else {
      // Refresh return hooks after any subsequent bet
      fetch('/api/return-hooks')
        .then((r) => r.ok ? r.json() : [])
        .then((hooks: ReturnHook[]) => setReturnHooks(hooks))
        .catch(() => {})
    }
  }

  const openTradeFromDetail = (side: "yes" | "no") => {
    if (!detailMarket) return
    setTradeModal({ market: detailMarket, side })
  }

  // ── Feed column (shared by mobile full-width + desktop left column) ──────────
  const feedColumn = (
    <div className="flex flex-col h-full w-full overflow-hidden relative">
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 w-full">
        {/* Screener stats bar */}
        <div className="bg-surface border-b border-border px-4 py-2 flex items-center gap-4 overflow-x-auto scrollbar-none">
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
            </>
          )}
        </div>

        {/* Session Arc strip — context-aware copy that shifts with session phase */}
        {!isFirstSession && arc.phase === "peaked" && arc.lastBet && (
          <div className="flex items-center gap-2 px-4 py-2 bg-accent/5 border-b border-accent/10">
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
        {!isFirstSession && arc.phase === "idle" && idleSuggestion && returnHooks.length === 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2 border-b border-border cursor-pointer hover:bg-secondary/50 transition-colors"
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

        {/* Filter tabs + subcategory chips */}
        <div className="sticky top-0 z-10 bg-background border-b border-border">
          {/* Primary category tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none px-4 pt-2 pb-2">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setActiveSubcat(null) }}
                className={cn(
                  "shrink-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
                  "transition-all duration-[80ms] ease-[var(--ease-sharp)] active:scale-[0.94]",
                  activeTab === tab
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary active:bg-muted"
                )}
                style={{ borderRadius: "var(--radius-badge)" }}
              >
                {tab}
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
            "flex items-center gap-2 px-4 py-2 border-b",
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

        {/* Return hooks — shown to returning users with open bets */}
        {returnHooks.length > 0 && (
          <>
            {/* "While you were away" summary — gives context before the chips */}
            <div className="px-4 pt-2.5 pb-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                {returnHooks.some((h) => h.urgent)
                  ? `⚡ ${returnHooks.length} bet${returnHooks.length > 1 ? 's' : ''} need attention`
                  : `${returnHooks.length} active bet${returnHooks.length > 1 ? 's' : ''} in play`}
              </p>
            </div>
            <ReturnHooksBar
              hooks={returnHooks}
              onHookClick={(hook) => {
                const market = markets.find((m) => m.id === hook.marketId)
                if (market) setDetailMarket(market)
              }}
            />
          </>
        )}

        {/* Onboarding: feed tooltip — explains the core action to new users */}
        {!loading && filtered.length > 0 && !ob.feedTooltipDone && (
          <FeedTooltip
            visible
            onDismiss={() => completeOb("feedTooltipDone")}
          />
        )}

        {/* Markets */}
        <div className="w-full px-4 py-3 space-y-3">
          {loading ? (
            /* Skeleton cards — match real card structure */
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton-card p-4 space-y-3" style={{ animationDelay: `${i * 80}ms` }}>
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
              <span className="text-3xl" aria-hidden>🔭</span>
              <p className="text-sm font-medium text-foreground">Nothing here yet</p>
              <p className="text-xs text-muted-foreground max-w-[220px] leading-relaxed">
                {activeSubcat
                  ? `No ${activeSubcat} markets right now.`
                  : activeTab === "All"
                  ? "New markets are added daily. Check back soon."
                  : `No ${activeTab} markets right now. Try another category or check back later.`}
              </p>
              {activeSubcat ? (
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
            filtered.map((market, idx) => {
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
                  onClick={() => { recordInteraction(); setDetailMarket(market) }}
                  onBuyYes={() => { recordInteraction(); openTrade(market, "yes") }}
                  onBuyNo={() => { recordInteraction(); openTrade(market, "no") }}
                />
              )
            })
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
          // Desktop: bottom-right of the feed column
          // sidebar=220px + feed=380px − button=44px − padding=16px = 540px from left
          "lg:right-auto lg:left-[540px] lg:bottom-6"
        )}
        style={{ bottom: "calc(65px + env(safe-area-inset-bottom) + 12px)" }}
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </button>
    </div>
  )

  return (
    <>
      {/* ── Desktop two-column layout (lg+) ────────────────────────────────── */}
      <div className="hidden lg:flex h-full overflow-hidden">
        {/* Left: scrollable feed list */}
        <div className="w-[380px] shrink-0 border-r border-border overflow-hidden flex flex-col">
          {feedColumn}
        </div>

        {/* Right: detail panel — fills remaining width */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {detailMarket ? (
            <MarketDetail
              mode="panel"
              market={detailMarket}
              onClose={() => setDetailMarket(null)}
              onBuyYes={() => openTradeFromDetail("yes")}
              onBuyNo={() => openTradeFromDetail("no")}
              onUsernameClick={onUsernameClick}
              currentUsername={currentUsername}
              currentAvatarUrl={currentAvatarUrl}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground select-none">
              <div className="w-12 h-12 rounded-full border border-border flex items-center justify-center">
                <BarChart2 className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium">Select a market to view details</p>
              <p className="text-xs text-muted-foreground/60">Click any card on the left</p>
            </div>
          )}
        </div>
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
          onDismiss={() => setPostBetInfo(null)}
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
