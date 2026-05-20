"use client"

import { useState, useCallback } from "react"
import { X, Copy, Check, TrendingUp, TrendingDown, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import { MarketFeedCard } from "@/components/market-feed-card"
import { BetModal } from "@/components/bet-modal"

interface CircleMember {
  id: string
  username: string
  rank: RankKey
  credits: number
  weeklyChange: number
  isCurrentUser?: boolean
}

interface CircleMarket {
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
  userBet?: { side: "yes" | "no"; amount: number }
  resolved?: { winner: "yes" | "no" }
}

interface Circle {
  id: string
  name: string
  inviteCode: string
  members: CircleMember[]
  markets: CircleMarket[]
}

interface CircleDetailProps {
  circle: Circle
  availableCredits: number
  onClose: () => void
  onBet: (
    marketTitle: string,
    marketCategory: string,
    side: "yes" | "no",
    amount: number,
    yesPercent: number,
    majorityWas: "yes" | "no",
    serverCredits?: number,
    serverXp?: number,
  ) => void
}

interface TradeModal {
  market: CircleMarket
  side: "yes" | "no"
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

function RankIcon({ rank }: { rank: RankKey }) {
  const config = RANKS[rank]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border",
        config.bg, config.border, config.color
      )}
      style={{ borderRadius: "var(--radius-badge)" }}
    >
      <span className={cn(config.glow && "drop-shadow-[0_0_3px_currentColor]")}>{config.icon}</span>
      {config.label}
    </span>
  )
}

function MemberAvatar({ username, size = "sm" }: { username: string; size?: "sm" | "md" }) {
  const initials = username.split(/[._-]/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
  const cls = size === "md" ? "w-10 h-10 text-sm" : "w-8 h-8 text-xs"
  return (
    <div className={cn("rounded-full bg-surface border border-border flex items-center justify-center font-mono font-semibold text-muted-foreground shrink-0", cls)}>
      {initials}
    </div>
  )
}

export function CircleDetail({ circle, availableCredits, onClose, onBet }: CircleDetailProps) {
  const [copied, setCopied] = useState(false)
  const [tradeModal, setTradeModal] = useState<TradeModal | null>(null)
  const [markets, setMarkets] = useState(circle.markets)

  const sorted = [...circle.members].sort((a, b) => b.credits - a.credits)
  const currentUser = sorted.find((m) => m.isCurrentUser)
  const currentUserRank = currentUser ? sorted.indexOf(currentUser) + 1 : null

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(circle.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select the text
    }
  }

  const handleBetSubmit = useCallback(async (side: "yes" | "no", amount: number) => {
    const market = tradeModal?.market
    if (!market) return

    const majorityWas: "yes" | "no" = market.yesPercent >= 50 ? "yes" : "no"
    const creditsBeforeBet = availableCredits

    setTradeModal(null)

    // Optimistic update — deduct credits and show toast immediately
    onBet(market.title, market.category, side, amount, market.yesPercent, majorityWas)

    const res = await fetch('/api/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market_id: market.id, side, amount }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('Bet failed:', err)
      // Reverse the optimistic deduction
      onBet(market.title, market.category, side, 0, market.yesPercent, majorityWas, creditsBeforeBet)
      return
    }

    const data = await res.json()
    const placed = data?.cappedAmount ?? amount

    setMarkets((prev) => prev.map((m) =>
      m.id === market.id ? { ...m, userBet: { side, amount: placed } } : m
    ))

    // Correct balance to exact server value
    if (data?.profile) {
      onBet(market.title, market.category, side, amount, market.yesPercent, majorityWas, data.profile.credits, data.profile.xp)
    }
  }, [tradeModal, onBet, availableCredits])

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in slide-in-from-bottom-full duration-300">

      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 h-[57px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
            <span className="text-accent text-sm font-bold">{circle.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{circle.name}</h2>
            <p className="text-[10px] text-muted-foreground">{circle.members.length} member{circle.members.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8 flex flex-col gap-5">

          {/* Invite code card */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-surface border border-border"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Invite Code</p>
              <p className="font-mono text-lg font-black text-accent tracking-widest">{circle.inviteCode}</p>
            </div>
            <button
              onClick={copyInviteCode}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border transition-all",
                copied
                  ? "bg-success/15 border-success/30 text-success"
                  : "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Your position */}
          {currentUser && currentUserRank && (
            <div
              className="grid grid-cols-3 divide-x divide-border border border-border"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <div className="flex flex-col items-center py-2.5">
                <span className="font-mono text-sm font-bold text-foreground">#{currentUserRank}</span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Your Rank</span>
              </div>
              <div className="flex flex-col items-center py-2.5">
                <span className="font-mono text-sm font-bold text-foreground">{formatCredits(currentUser.credits)}</span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Credits</span>
              </div>
              <div className="flex flex-col items-center py-2.5">
                <span className={cn(
                  "font-mono text-sm font-bold",
                  currentUser.weeklyChange >= 0 ? "text-success" : "text-danger"
                )}>
                  {currentUser.weeklyChange >= 0 ? "+" : ""}{formatCredits(currentUser.weeklyChange)}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">7d Change</span>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Leaderboard</span>
            </div>

            <div
              className="border border-border overflow-hidden"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              {sorted.map((member, i) => {
                const pos = i + 1
                const medalStyle =
                  pos === 1 ? "text-[#FFD700]" :
                  pos === 2 ? "text-[#C0C0C0]" :
                  pos === 3 ? "text-[#CD7F32]" :
                  "text-muted-foreground"

                return (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0",
                      "transition-colors",
                      member.isCurrentUser ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-secondary/20"
                    )}
                  >
                    {/* Position */}
                    <span className={cn("font-mono text-sm font-bold w-5 shrink-0 text-center", medalStyle)}>
                      {pos <= 3 ? ["🥇","🥈","🥉"][pos - 1] : pos}
                    </span>

                    <MemberAvatar username={member.username} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("text-sm font-medium truncate", member.isCurrentUser && "text-accent")}>
                          @{member.username}
                        </span>
                        {member.isCurrentUser && (
                          <span className="text-[9px] text-accent uppercase tracking-wider font-bold shrink-0">You</span>
                        )}
                      </div>
                      <RankIcon rank={member.rank} />
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-semibold text-foreground">{formatCredits(member.credits)} CR</p>
                      <p className={cn(
                        "text-[11px] font-mono",
                        member.weeklyChange >= 0 ? "text-success" : "text-danger"
                      )}>
                        {member.weeklyChange >= 0 ? "▲" : "▼"} {formatCredits(Math.abs(member.weeklyChange))}
                      </p>
                    </div>
                  </div>
                )
              })}

              {sorted.length === 0 && (
                <div className="py-10 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Invite friends to get the leaderboard going</p>
                </div>
              )}
            </div>
          </div>

          {/* Circle-specific markets */}
          {markets.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Circle Markets</span>
              </div>
              <div className="space-y-3">
                {markets.map((market) => (
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
                    onBuyYes={() => !market.userBet && !market.resolved && setTradeModal({ market, side: "yes" })}
                    onBuyNo={() => !market.userBet && !market.resolved && setTradeModal({ market, side: "no" })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Share prompt */}
          <div
            className="border-2 border-dashed border-border py-6 flex flex-col items-center gap-2 text-center"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <p className="text-xs font-medium text-foreground">Invite friends to compete</p>
            <p className="text-[11px] text-muted-foreground">Share code <span className="font-mono font-bold text-accent">{circle.inviteCode}</span></p>
            <button
              onClick={copyInviteCode}
              className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider bg-accent text-accent-foreground hover:bg-accent/90 transition-all"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy Invite Code"}
            </button>
          </div>

        </div>
      </div>

      {/* Bet modal */}
      {tradeModal && (
        <BetModal
          market={tradeModal.market}
          initialSide={tradeModal.side}
          availableCredits={availableCredits}
          onClose={() => setTradeModal(null)}
          onSubmit={handleBetSubmit}
        />
      )}
    </div>
  )
}
