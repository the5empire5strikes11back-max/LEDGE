"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { MarketFeedCard } from "@/components/market-feed-card"
import { BetModal } from "@/components/bet-modal"
import { MarketDetail } from "@/components/market-detail"
import { FeedTooltip } from "@/components/onboarding/feed-tooltip"
import { PostBetPanel } from "@/components/onboarding/post-bet-panel"
import { ReturnHooksBar } from "@/components/onboarding/return-hooks-bar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { pushOddsPoint, seedOddsHistory, type OddsPoint } from "@/lib/odds-history"
import { useOnboarding } from "@/lib/onboarding"
import { rankFeedFirstSession } from "@/lib/feed-ranker"
import type { ReturnHook } from "@/app/api/return-hooks/route"

type Category = "All" | "Sports" | "Politics" | "Culture" | "Circle"

const ALL_TABS: Category[] = ["All", "Sports", "Politics", "Culture", "Circle"]
// Circle is hidden on first session — undefined concept for new users
const FIRST_SESSION_TABS: Category[] = ["All", "Sports", "Politics", "Culture"]

import type { MarketSocialData } from "@/lib/social-signals"

interface Market {
  id: string
  title: string
  category: "Sports" | "Politics" | "Culture" | "Circle"
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

export function FeedScreen({ availableCredits, streak, decay, onBet, onWin }: FeedScreenProps) {
  const [activeTab, setActiveTab] = useState<Category>("All")
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [detailMarket, setDetailMarket] = useState<Market | null>(null)
  const [tradeModal, setTradeModal] = useState<TradeModal | null>(null)
  const [postBetInfo, setPostBetInfo] = useState<PostBetInfo | null>(null)
  const [returnHooks, setReturnHooks] = useState<ReturnHook[]>([])
  const { state: ob, complete: completeOb } = useOnboarding()

  // First-session: user hasn't placed a bet yet
  const isFirstSession = !ob.firstBetAchievementDone
  const TABS = isFirstSession ? FIRST_SESSION_TABS : ALL_TABS

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
      // Seed one baseline point per market from the initial load
      seedOddsHistory(
        oddsHistoryRef.current,
        data.map((m) => ({ id: m.id, yesPercent: m.yesPercent }))
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

  // Apply first-session ranking to All tab when user hasn't bet yet
  const filtered = (isFirstSession && activeTab === "All")
    ? rankFeedFirstSession(
        rawFiltered.map((m) => ({
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
      ).map((ranked) => rawFiltered.find((m) => m.id === ranked.id)!)
    : rawFiltered

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

  const openTrade = (market: Market, side: "yes" | "no") => {
    if (market.userBet || market.resolved) return
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
      console.error('Bet failed:', err?.error ?? `Server error (${res.status})`)
      onBet(market.title, market.category, side, 0, market.yesPercent, majorityWas, creditsBeforeBet)
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
    <div className="flex flex-col h-full w-full overflow-hidden">
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
                    <span className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold">
                      🔥 <span className="font-mono">{hotCount}</span> hot
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Filter tabs */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "shrink-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150",
                  activeTab === tab
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
                style={{ borderRadius: "var(--radius-badge)" }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Streak urgency — for returning users with an active streak at risk */}
        {!isFirstSession && streak >= 2 && decay !== "none" && (
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 border-b",
            decay === "critical"
              ? "bg-danger/5 border-danger/15"
              : "bg-accent/5 border-accent/10"
          )}>
            <span className="text-sm shrink-0" aria-hidden>🔥</span>
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
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-muted-foreground text-sm">No {activeTab.toLowerCase()} markets right now.</p>
            </div>
          ) : (
            filtered.map((market) => {
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

              return (
                <MarketFeedCard
                  key={market.id}
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
                  onClick={() => setDetailMarket(market)}
                  onBuyYes={() => openTrade(market, "yes")}
                  onBuyNo={() => openTrade(market, "no")}
                />
              )
            })
          )}
        </div>
      </div>
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
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground select-none">
              <div className="w-12 h-12 rounded-full border border-border flex items-center justify-center">
                <span className="text-xl">📊</span>
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
    </>
  )
}
