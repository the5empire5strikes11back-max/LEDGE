"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { X, Copy, Check, Users, Plus, Clock, Camera, Loader2, Trash2, UsersRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import { MarketFeedCard } from "@/components/market-feed-card"
import { BetModal } from "@/components/bet-modal"
import { UserAvatar, CircleAvatar } from "@/components/ui/user-avatar"
import { ProgressiveTip } from "@/components/onboarding/progressive-tip"
import { useOnboarding } from "@/lib/onboarding"
import { compressToSquare } from "@/lib/compress-image"

interface CircleMember {
  id: string
  username: string
  avatarUrl?: string | null
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
  voided?: boolean
}

interface Circle {
  id: string
  name: string
  inviteCode: string
  circleAvatarUrl?: string | null
  members: CircleMember[]
  markets: CircleMarket[]
}

interface CircleDetailProps {
  circle: Circle
  availableCredits: number
  isCreator?: boolean
  onClose: () => void
  onDelete?: (circleId: string) => void
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


// Duration options for new circle markets
const DURATION_OPTIONS = [
  { label: "1 hour",   hours: 1 },
  { label: "6 hours",  hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "3 days",   hours: 72 },
  { label: "1 week",   hours: 168 },
]

export function CircleDetail({ circle, availableCredits, isCreator = false, onClose, onDelete, onBet }: CircleDetailProps) {
  const [copied, setCopied] = useState(false)
  const [tradeModal, setTradeModal] = useState<TradeModal | null>(null)
  const [markets, setMarkets] = useState<CircleMarket[]>(circle.markets)
  const [marketsLoading, setMarketsLoading] = useState(true)
  const { state: ob, complete: completeOb } = useOnboarding()

  // Circle avatar upload
  const [circleAvatarUrl, setCircleAvatarUrl] = useState<string | null>(circle.circleAvatarUrl ?? null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarFileRef = useRef<HTMLInputElement>(null)

  // Delete circle
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  // Create market form
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [durationHours, setDurationHours] = useState(24)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState("")

  const sorted = [...circle.members].sort((a, b) => b.credits - a.credits)
  const currentUser = sorted.find((m) => m.isCurrentUser)
  const currentUserRank = currentUser ? sorted.indexOf(currentUser) + 1 : null

  const handleCircleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      const blob = await compressToSquare(file, 400)
      const compressed = new File([blob], "avatar.jpg", { type: "image/jpeg" })
      const form = new FormData()
      form.append("file", compressed)
      form.append("circle_id", circle.id)
      const res = await fetch("/api/circles/avatar", { method: "POST", body: form })
      if (res.ok) {
        const data = await res.json()
        setCircleAvatarUrl(data.circle_avatar_url)
      }
    } finally {
      setAvatarUploading(false)
      if (avatarFileRef.current) avatarFileRef.current.value = ""
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    setDeleteError("")
    const res = await fetch(`/api/circles/${circle.id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (res.ok) {
      onDelete?.(circle.id)
      onClose()
    } else {
      const data = await res.json().catch(() => ({}))
      setDeleteError(data.error ?? 'Failed to delete circle')
    }
  }

  // Fetch circle markets on mount
  useEffect(() => {
    fetch(`/api/circles/${circle.id}/markets`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setMarkets(data))
      .catch(() => {})
      .finally(() => setMarketsLoading(false))
  }, [circle.id])

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(circle.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleCreateMarket = async () => {
    if (!newTitle.trim()) return
    setCreateLoading(true)
    setCreateError("")

    const end_time = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()

    const res = await fetch(`/api/circles/${circle.id}/markets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), end_time }),
    })

    setCreateLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setCreateError(data.error ?? 'Failed to create market')
      return
    }

    const market = await res.json()
    const mapped: CircleMarket = {
      id: market.id,
      title: market.title,
      category: 'Circle',
      endTime: market.end_time,
      yesPercent: market.yes_percent ?? 50,
      yesPool: market.yes_pool ?? 0,
      noPool: market.no_pool ?? 0,
      totalCredits: 0,
      hotScore: 0,
      momentumShift: 0,
    }
    setMarkets((prev) => [mapped, ...prev])
    setNewTitle("")
    setCreating(false)
  }

  const handleBetSubmit = useCallback(async (side: "yes" | "no", amount: number) => {
    const market = tradeModal?.market
    if (!market) return

    const majorityWas: "yes" | "no" = market.yesPercent >= 50 ? "yes" : "no"
    const creditsBeforeBet = availableCredits

    setTradeModal(null)
    onBet(market.title, market.category, side, amount, market.yesPercent, majorityWas)

    const res = await fetch('/api/bets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ market_id: market.id, side, amount }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('Bet failed:', err)
      onBet(market.title, market.category, side, 0, market.yesPercent, majorityWas, creditsBeforeBet)
      return
    }

    const data = await res.json()
    const placed = data?.cappedAmount ?? amount

    setMarkets((prev) => prev.map((m) =>
      m.id === market.id ? { ...m, userBet: { side, amount: placed } } : m
    ))

    if (data?.profile) {
      onBet(market.title, market.category, side, amount, market.yesPercent, majorityWas, data.profile.credits, data.profile.xp)
    }
  }, [tradeModal, onBet, availableCredits])

  // A prediction leaves the active list the moment its time is up — whether it's
  // already settled OR closed and awaiting a result — and moves to Past Predictions.
  const nowMs = Date.now()
  const isClosed = (m: CircleMarket) => !!m.resolved || m.voided || new Date(m.endTime).getTime() <= nowMs
  const openMarkets = markets.filter((m) => !isClosed(m))
  const pastMarkets = markets
    .filter(isClosed)
    .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in slide-in-from-bottom-full duration-300">

      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 h-[57px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Circle avatar with tap-to-upload */}
          <div className="relative shrink-0 group">
            <CircleAvatar name={circle.name} avatarUrl={circleAvatarUrl} size={34} />
            <button
              onClick={() => avatarFileRef.current?.click()}
              disabled={avatarUploading}
              aria-label="Change circle picture"
              className="absolute inset-0 rounded-xl flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {avatarUploading
                ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                : <Camera className="w-3 h-3 text-white" />
              }
            </button>
            <input ref={avatarFileRef} type="file" accept="image/*" className="sr-only" onChange={handleCircleAvatarChange} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold truncate">{circle.name}</h2>
            <p className="text-[10px] text-muted-foreground">{circle.members.length} member{circle.members.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCreating(true); setCreateError("") }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground text-xs font-semibold uppercase tracking-wider hover:bg-accent/90 transition-all active:scale-95"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <Plus className="w-3 h-3" />
            Predict
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8 flex flex-col gap-5">

          {/* Create market form */}
          {creating && (
            <div
              className="bg-card border border-accent/30 p-4 space-y-3 animate-in slide-in-from-top-2 fade-in duration-200"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">New Prediction</p>

              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => { setNewTitle(e.target.value); setCreateError("") }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateMarket()}
                placeholder="Will [something] happen?"
                maxLength={200}
                className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
                style={{ borderRadius: "var(--radius-button)" }}
              />

              {/* Duration picker */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Closes in</span>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.hours}
                      onClick={() => setDurationHours(opt.hours)}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold border transition-all",
                        durationHours === opt.hours
                          ? "bg-accent text-accent-foreground border-accent"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                      )}
                      style={{ borderRadius: "var(--radius-badge)" }}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {createError && (
                <p className="text-[11px] text-danger font-medium">{createError}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleCreateMarket}
                  disabled={createLoading || !newTitle.trim()}
                  className="flex-1 py-2 bg-accent text-accent-foreground text-xs font-bold uppercase tracking-wider hover:bg-accent/90 transition-all active:scale-95 disabled:opacity-50"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  {createLoading ? "Creating…" : "Create Prediction"}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewTitle(""); setCreateError("") }}
                  className="flex-1 py-2 bg-secondary text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Invite code */}
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

          {/* Circle markets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                  Predictions
                </span>
              </div>
              {!creating && (
                <button
                  onClick={() => { setCreating(true); setCreateError("") }}
                  className="text-[10px] text-accent hover:text-accent/80 font-semibold uppercase tracking-wider transition-colors"
                >
                  + New
                </button>
              )}
            </div>

            {marketsLoading ? (
              <div className="py-8 flex justify-center">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : openMarkets.length === 0 && pastMarkets.length === 0 ? (
              <div
                className="border-2 border-dashed border-border py-10 flex flex-col items-center gap-2 text-center"
                style={{ borderRadius: "var(--radius-card)" }}
              >
                <p className="text-sm font-semibold text-muted-foreground">No predictions yet</p>
                <p className="text-xs text-muted-foreground/60">Be the first to create one</p>
                <button
                  onClick={() => setCreating(true)}
                  className="mt-2 px-4 py-2 bg-accent text-accent-foreground text-xs font-semibold uppercase tracking-wider hover:bg-accent/90 transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  Create Prediction
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {openMarkets.length === 0 && pastMarkets.length > 0 && (
                  <p className="text-[11px] text-muted-foreground/70 text-center py-2">
                    No open predictions — create one above.
                  </p>
                )}
                {openMarkets.map((market) => (
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

                {pastMarkets.length > 0 && (
                  <>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold pt-1">Past Predictions</p>
                    {pastMarkets.map((market) => (
                      <MarketFeedCard
                        key={market.id}
                        {...market}
                        endTime={new Date(market.endTime)}
                        yesPool={market.yesPool ?? 0}
                        noPool={market.noPool ?? 0}
                        hotScore={market.hotScore ?? 0}
                        momentumShift={market.momentumShift ?? 0}
                        isFeatured={false}
                        isNearMiss={market.isNearMiss ?? false}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Leaderboard</span>
            </div>
            <div className="border border-border overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}>
              {sorted.map((member, i) => {
                const pos = i + 1
                const medalStyle =
                  pos === 1 ? "text-white" :
                  pos === 2 ? "text-[#C0C0C0]" :
                  pos === 3 ? "text-[#CD7F32]" :
                  "text-muted-foreground"

                return (
                  <div
                    key={member.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 transition-colors",
                      member.isCurrentUser ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-secondary/20"
                    )}
                  >
                    <span className={cn("font-mono text-sm font-bold w-5 shrink-0 text-center", medalStyle)}>
                      {pos <= 3 ? ["🥇","🥈","🥉"][pos - 1] : pos}
                    </span>
                    <UserAvatar username={member.username} avatarUrl={member.avatarUrl} size={32} />
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
                      <p className={cn("text-[11px] font-mono", member.weeklyChange >= 0 ? "text-success" : "text-danger")}>
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

          {/* Danger zone — creator only */}
          {isCreator && (
            <div
              className="border border-border bg-card px-4 py-4 space-y-3"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Danger Zone</p>
              {deleteConfirm ? (
                <div className="space-y-2">
                  <p className="text-xs text-foreground">
                    Permanently delete <span className="font-semibold">{circle.name}</span>?
                    All predictions and members will be removed. This cannot be undone.
                  </p>
                  {deleteError && (
                    <p className="text-[11px] text-danger font-medium">{deleteError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      disabled={deleteLoading}
                      className="flex-1 py-2 bg-danger text-white text-xs font-bold uppercase tracking-wider hover:bg-danger/90 transition-all active:scale-95 disabled:opacity-50"
                      style={{ borderRadius: "var(--radius-button)" }}
                    >
                      {deleteLoading ? "Deleting…" : "Yes, Delete"}
                    </button>
                    <button
                      onClick={() => { setDeleteConfirm(false); setDeleteError("") }}
                      disabled={deleteLoading}
                      className="flex-1 py-2 bg-secondary text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-all"
                      style={{ borderRadius: "var(--radius-button)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-danger border border-danger/30 hover:bg-danger/8 transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Circle
                </button>
              )}
            </div>
          )}

          {/* Share prompt */}
          <div
            className="border-2 border-dashed border-border py-6 flex flex-col items-center gap-2 text-center"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <p className="text-xs font-medium text-foreground">Invite friends to compete</p>
            <p className="text-[11px] text-muted-foreground">
              Share code <span className="font-mono font-bold text-accent">{circle.inviteCode}</span>
            </p>
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

      {/* Circle progressive tip — shown on first visit */}
      <ProgressiveTip
        show={!ob.circleTipDone}
        icon={UsersRound}
        title="Circle Markets"
        body="Bet against your friends on exclusive circle-only predictions. Create markets on anything — your group picks the topics."
        onDismiss={() => completeOb("circleTipDone")}
      />
    </div>
  )
}
