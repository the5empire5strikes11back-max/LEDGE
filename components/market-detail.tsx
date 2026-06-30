"use client"

import { useState, useEffect, useCallback } from "react"
import { X, TrendingUp, TrendingDown, Activity, Users, Flame, Fish, ExternalLink, Flag, Share2, Check, ImageIcon, ShieldCheck } from "lucide-react"
import { getResolutionMeta, formatResolvedAt } from "@/lib/resolution-label"
import { PredictionCardOverlay } from "@/components/share-card/prediction-card-overlay"
import type { PredictionResultData } from "@/components/share-card/prediction-result-card"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/ui/user-avatar"
import { useOnboarding } from "@/lib/onboarding"
import { ProgressiveTip } from "@/components/onboarding/progressive-tip"
import { Countdown } from "@/components/ui/countdown"
import { computeDetailSignals } from "@/lib/social-signals"
import { MarketComments } from "@/components/market-comments"
import { payoutMultiplier } from "@/lib/game-engine"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts"

interface MarketDetailProps {
  market: {
    id: string
    title: string
    category: string
    subcategory?: string | null
    yesPercent: number
    yesPool: number
    noPool: number
    totalCredits: number
    hotScore?: number
    momentumShift?: number
    isFeatured?: boolean
    endTime: string
    resolved?: {
      winner: "yes" | "no"
      note?: string | null
      sourceUrl?: string | null
      resolvedAt?: string | null
    }
    resolutionCriteria?: string | null
    resolutionSourceUrl?: string | null
    targetDataKey?: string | null
    userBet?: { side: "yes" | "no"; amount: number; payout?: number | null; shares?: number | null; value?: number | null }
    autoBet?: { id: string; side: "yes" | "no"; targetPercent: number; amount: number }
    /** Creator-resolution (subjective markets). */
    resolutionMode?: "auto" | "creator"
    creatorProposedWinner?: "yes" | "no" | null
    creatorResolvedAt?: string | null
    isCreator?: boolean
    creatorUsername?: string | null
    creatorTrust?: number | null
  }
  onClose: () => void
  onBuyYes: () => void
  onBuyNo: () => void
  /** Cash out the user's open position early. Bubbles the new balance + payout up. */
  onCashout?: (marketId: string, newCredits: number, cashoutValue: number) => void
  /** Cancel an armed auto-bet on this market (refunds the escrowed credits). */
  onCancelAutoBet?: (marketId: string) => void
  /** "overlay" = full-screen fixed modal (mobile default).
   *  "panel"   = fills its container, no fixed positioning (desktop side panel). */
  mode?: "overlay" | "panel"
  onUsernameClick?: (username: string) => void
  currentUsername?: string | null
  currentAvatarUrl?: string | null
}

interface BetActivity {
  id: string
  username: string
  avatarUrl?: string | null
  side: string
  amount: number
  created_at: string
}

interface HistoryPoint {
  timestamp: string
  yesPercent: number
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-border px-2 py-1 text-xs font-mono">
      <span className="text-success font-bold">{payload[0].value.toFixed(1)}%</span>
      <span className="text-muted-foreground ml-1">YES</span>
    </div>
  )
}

// ── Signal tile ───────────────────────────────────────────────────────────────

function SignalTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "yes" | "no" | "alert" | "whale"
}) {
  const valueColor: Record<string, string> = {
    neutral: "text-foreground",
    yes:     "text-success",
    no:      "text-danger",
    alert:   "text-review",
    whale:   "text-accent",
  }
  return (
    <div
      className="flex flex-col gap-0.5 bg-surface border border-border px-3 py-2.5"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
      <span className={cn("text-xs font-semibold leading-snug", valueColor[tone])}>{value}</span>
    </div>
  )
}

// ── Trader distribution bar ───────────────────────────────────────────────────

function TraderDistribution({
  yesBetterCount,
  noBetterCount,
}: {
  yesBetterCount: number
  noBetterCount: number
}) {
  const total = yesBetterCount + noBetterCount
  if (total === 0) return null
  const yesPct = Math.round((yesBetterCount / total) * 100)
  const noPct  = 100 - yesPct

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Trader Distribution</span>
      <div className="flex h-1.5 overflow-hidden gap-px" style={{ borderRadius: "9999px" }}>
        <div className="bg-success/70 transition-all duration-500" style={{ width: `${yesPct}%` }} />
        <div className="bg-danger/70  transition-all duration-500" style={{ width: `${noPct}%`  }} />
      </div>
      <div className="flex justify-between">
        <span className="text-[9px] text-success/70 font-mono">{yesBetterCount} YES ({yesPct}%)</span>
        <span className="text-[9px] text-danger/70  font-mono">{noBetterCount} NO ({noPct}%)</span>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function MarketDetail({ market, onClose, onBuyYes, onBuyNo, onCashout, onCancelAutoBet, mode = "overlay", onUsernameClick, currentUsername, currentAvatarUrl }: MarketDetailProps) {
  const isPanel = mode === "panel"
  const [confirmCashout, setConfirmCashout] = useState(false)
  const [cashingOut, setCashingOut] = useState(false)
  const [bets, setBets]       = useState<BetActivity[]>([])
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeText, setDisputeText] = useState("")
  const [disputeSubmitting, setDisputeSubmitting] = useState(false)
  const [disputeSubmitted, setDisputeSubmitted] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [showResultCard, setShowResultCard] = useState(false)
  const { state: ob, complete: completeOb } = useOnboarding()

  const isResolved  = !!market.resolved
  const isHot       = (market.hotScore ?? 0) >= 8
  const hasMomentum = (market.momentumShift ?? 0) >= 3
  const yesPercent  = market.yesPercent
  const noPercent   = 100 - yesPercent
  const resMeta     = getResolutionMeta(market.resolutionSourceUrl, market.targetDataKey)

  // Cash-out value comes from the server's CPMM (the exact value you'd get by
  // selling your shares back into the pool right now). Use it directly so the
  // preview matches the executed cash-out — no drift. Fall back to the old
  // estimate only for legacy positions the server didn't value.
  const isLiveForCashout = !isResolved && new Date(market.endTime).getTime() > Date.now()
  const cashoutValue = (() => {
    const ub = market.userBet
    if (!ub || !isLiveForCashout) return null
    if (ub.value != null) return ub.value
    if (ub.payout == null) return null
    const sideProb = ub.side === "yes" ? yesPercent : noPercent
    return Math.max(0, Math.floor((sideProb / 100) * ub.payout))
  })()

  const handleCashout = useCallback(async () => {
    if (cashingOut || !market.userBet) return
    setCashingOut(true)
    try {
      const res = await fetch("/api/bets/cashout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market_id: market.id }),
      })
      if (res.ok) {
        const data = await res.json()
        onCashout?.(market.id, data.newCredits, data.cashoutValue)
      }
    } finally {
      setCashingOut(false)
      setConfirmCashout(false)
    }
  }, [cashingOut, market.id, market.userBet, onCashout])

  const load = useCallback(async () => {
    const res = await fetch(`/api/markets/${market.id}/bets`)
    if (res.ok) {
      const data = await res.json()
      setBets((data.bets ?? []).slice().reverse())
      setHistory(data.history ?? [])
    }
    setLoading(false)
  }, [market.id])

  const submitDispute = useCallback(async () => {
    if (!disputeText.trim() || disputeSubmitting) return
    setDisputeSubmitting(true)
    try {
      const res = await fetch(`/api/markets/${market.id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: disputeText.trim() }),
      })
      if (res.ok) {
        setDisputeSubmitted(true)
        setDisputeOpen(false)
        setDisputeText("")
      }
    } finally {
      setDisputeSubmitting(false)
    }
  }, [market.id, disputeText, disputeSubmitting])

  // Creator-resolution (subjective markets)
  const isCreatorMode = market.resolutionMode === "creator"
  const isClosedNow = new Date(market.endTime).getTime() <= Date.now()
  // The creator settles their own closed market that hasn't been proposed yet.
  const canCreatorSettle =
    isCreatorMode && market.isCreator && isClosedNow && !market.resolved && !market.creatorProposedWinner
  // A proposed-but-held market is in its dispute window for 24h.
  const inCreatorDisputeWindow = (() => {
    if (!isCreatorMode || market.resolved || !market.creatorProposedWinner || !market.creatorResolvedAt) return false
    const hoursAgo = (Date.now() - new Date(market.creatorResolvedAt).getTime()) / 3_600_000
    return hoursAgo <= 24
  })()
  const [settling, setSettling] = useState(false)
  const [settledProposal, setSettledProposal] = useState<"yes" | "no" | null>(null)

  const handleProposeSettle = useCallback(async (winner: "yes" | "no") => {
    if (settling) return
    setSettling(true)
    try {
      const res = await fetch(`/api/markets/${market.id}/propose`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner }),
      })
      if (res.ok) setSettledProposal(winner)
    } finally {
      setSettling(false)
    }
  }, [market.id, settling])

  // Dispute window: 24h after resolution OR during the creator dispute window,
  // only if the viewer placed a bet (and isn't the creator).
  const isResolutionDisputeable = (() => {
    if (disputeSubmitted) return false
    if (!market.userBet || market.isCreator) return false
    if (inCreatorDisputeWindow) return true
    if (!market.resolved?.resolvedAt) return false
    const hoursAgo = (Date.now() - new Date(market.resolved.resolvedAt).getTime()) / 3_600_000
    return hoursAgo <= 24
  })()

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/?m=${market.id}`
    const shareData = { title: market.title, url }
    if (navigator.share && navigator.canShare?.(shareData)) {
      try { await navigator.share(shareData); return } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch { /* ignore */ }
  }, [market.id, market.title])

  useEffect(() => { load() }, [load])

  // Lock background scroll while overlay is open so the feed doesn't
  // scroll underneath and leave a black gap behind the detail panel.
  useEffect(() => {
    if (isPanel) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isPanel])

  // Social signals — computed from the full bets list (available after load)
  const signals = computeDetailSignals(
    bets.map((b) => ({ side: b.side, amount: b.amount, created_at: b.created_at })),
    yesPercent
  )

  // Progressive tip: first time user sees whale activity
  useEffect(() => {
    if (!loading && signals.hasWhale && !ob.whaleTipDone) {
      const t = setTimeout(() => completeOb("whaleTipDone"), 6000)
      return () => clearTimeout(t)
    }
  }, [loading, signals.hasWhale, ob.whaleTipDone, completeOb])

  const chartData = history.length > 0
    ? history.map((h) => ({ ts: new Date(h.timestamp).getTime(), y: h.yesPercent }))
    : [{ ts: Date.now(), y: yesPercent }]

  const chartMin = Math.max(0,   Math.min(...chartData.map((d) => d.y)) - 5)
  const chartMax = Math.min(100, Math.max(...chartData.map((d) => d.y)) + 5)
  const chartOpenPct  = chartData[0]?.y ?? yesPercent
  const chartNowPct   = chartData[chartData.length - 1]?.y ?? yesPercent
  const chartDelta    = Math.round((chartNowPct - chartOpenPct) * 10) / 10
  const chartColor    = chartNowPct >= 50 ? "#22c55e" : "#ef4444"
  const chartGradId   = chartNowPct >= 50 ? "yesGradGreen" : "yesGradRed"

  function fmtChartTime(ts: number): string {
    const d = new Date(ts)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - ts) / 86_400_000)
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    if (diffDays < 7)  return d.toLocaleDateString([], { weekday: "short" })
    return d.toLocaleDateString([], { month: "short", day: "numeric" })
  }

  return (
    <div className={cn(
      "flex flex-col bg-background",
      isPanel
        ? "h-full"
        : "fixed inset-0 z-40 animate-in slide-in-from-bottom-full duration-300"
    )}>

      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 h-[57px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 border",
              market.category === "Sports"   ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
              : market.category === "Politics" ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
              : market.category === "Culture"  ? "bg-pink-500/10 text-pink-400 border-pink-500/20"
              : market.category === "Tech"     ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
              : market.category === "Viral"    ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
              : market.category === "Wild"     ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
              : "bg-accent/10 text-accent border-accent/20"
            )}
            style={{ borderRadius: "var(--radius-badge)" }}
          >
            {market.subcategory || market.category}
          </span>
          {isHot && (
            <span className="inline-flex items-center gap-0.5 shrink-0 text-[9px] font-black text-review uppercase tracking-wider px-1.5 py-0.5 bg-review/10 border border-review/20 animate-pulse" style={{ borderRadius: "var(--radius-badge)" }}>
              <Flame className="w-2.5 h-2.5" />HOT
            </span>
          )}
          {hasMomentum && !isHot && (
            <span className="shrink-0 text-[9px] font-bold text-accent uppercase tracking-wider px-1.5 py-0.5 bg-accent/10 border border-accent/20" style={{ borderRadius: "var(--radius-badge)" }}>
              ↑{(market.momentumShift ?? 0).toFixed(1)}% MOVING
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleShare}
            aria-label="Share market"
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-[0.88] transition-all duration-[80ms] ease-[var(--ease-sharp)]"
            title="Share market"
          >
            {shareCopied ? <Check className="w-4 h-4 text-success" /> : <Share2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            aria-label="Close market detail"
            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-[0.88] transition-all duration-[80ms] ease-[var(--ease-sharp)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          /* Loading skeleton — mirrors real layout so there's no layout shift */
          <div className="px-4 pt-4 flex flex-col gap-5 pb-32 animate-pulse">
            {/* Title */}
            <div className="space-y-2">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
            </div>
            {/* Probability tiles */}
            <div className="flex items-stretch gap-3">
              <div className="skeleton flex-1 h-24" style={{ borderRadius: "var(--radius-card)" }} />
              <div className="skeleton flex-1 h-24" style={{ borderRadius: "var(--radius-card)" }} />
            </div>
            {/* Odds bar */}
            <div className="skeleton h-1.5 w-full" style={{ borderRadius: "9999px" }} />
            {/* Stats row */}
            <div className="skeleton h-14 w-full" style={{ borderRadius: "var(--radius-button)" }} />
            {/* Chart */}
            <div className="skeleton h-36 w-full" style={{ borderRadius: "var(--radius-card)" }} />
            {/* Signal tiles */}
            <div className="grid grid-cols-2 gap-2">
              {[0,1,2,3].map((i) => (
                <div key={i} className="skeleton h-12" style={{ borderRadius: "var(--radius-card)" }} />
              ))}
            </div>
          </div>
        ) : (
        <div className={cn("px-4 pt-4 flex flex-col gap-5", isPanel ? "pb-4" : "pb-40")}>

          <h1 className="text-base font-semibold text-foreground leading-snug">{market.title}</h1>

          {market.creatorUsername && (
            <div className="flex items-center gap-1.5 -mt-2">
              <span className="text-xs text-muted-foreground">@{market.creatorUsername}</span>
              {market.creatorTrust != null && market.creatorTrust >= 0.70 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 px-1.5 py-0.5 rounded-full">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  Trusted
                </span>
              )}
              {market.creatorTrust != null && market.creatorTrust < 0.35 && (
                <span className="text-[10px] font-semibold text-white/50 bg-white/[0.06] px-1.5 py-0.5 rounded-full">
                  New creator
                </span>
              )}
            </div>
          )}

          {/* How this resolves — front-and-center trust block. Ledge's edge over
              creator-resolved markets: it settles on official data, or refunds. */}
          {!isResolved && (market.resolutionCriteria || resMeta.label || isCreatorMode) && (
            <div
              className={cn(
                "px-3.5 py-3 flex flex-col gap-2.5",
                isCreatorMode ? "bg-surface border border-accent/25" : resMeta.isAuto ? "bg-success/5 border border-success/20" : "bg-surface border border-border"
              )}
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <div className="flex items-center gap-1.5">
                {isCreatorMode ? (
                  <span className="text-sm leading-none" aria-hidden>👤</span>
                ) : (
                  <ShieldCheck className={cn("w-4 h-4 shrink-0", resMeta.isAuto ? "text-success" : "text-muted-foreground/60")} />
                )}
                <span className="text-[11px] uppercase tracking-wider font-bold text-foreground">
                  {isCreatorMode ? "Creator-resolved" : resMeta.isAuto ? "Auto-resolves" : "Resolution"}
                </span>
                {!isCreatorMode && resMeta.label && (
                  <span className="text-[11px] text-muted-foreground">
                    via <span className="text-foreground font-semibold">{resMeta.label}</span>
                  </span>
                )}
              </div>

              {market.resolutionCriteria && (
                <p className="text-xs text-muted-foreground leading-relaxed">{market.resolutionCriteria}</p>
              )}

              {isCreatorMode ? (
                <p className="text-[10px] text-muted-foreground/80 leading-snug flex items-start gap-1.5">
                  <span aria-hidden>⚖️</span>
                  The creator settles this when it closes. You get 24h to dispute the call — if enough bettors do, it voids and everyone is refunded.
                </p>
              ) : resMeta.isAuto && (
                <p className="text-[10px] text-success/80 leading-snug flex items-start gap-1.5">
                  <Check className="w-3 h-3 shrink-0 mt-px" />
                  Settles automatically on official data — no one decides the outcome by hand. If it can&rsquo;t be verified, every stake is refunded.
                </p>
              )}
            </div>
          )}

          {/* Creator settle control — the creator settles their own closed market */}
          {canCreatorSettle && !settledProposal && (
            <div className="px-3.5 py-3 flex flex-col gap-2.5 bg-accent/5 border border-accent/30" style={{ borderRadius: "var(--radius-card)" }}>
              <p className="text-[11px] uppercase tracking-wider font-bold text-foreground">Settle this market</p>
              <p className="text-[10px] text-muted-foreground/80">Pick the outcome. Bettors get 24h to dispute before it pays out.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleProposeSettle("yes")} disabled={settling}
                  className="py-2.5 text-xs font-bold uppercase tracking-wider bg-success/15 text-success border border-success/30 hover:bg-success/25 active:scale-[0.98] disabled:opacity-50 transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}>Resolve YES</button>
                <button onClick={() => handleProposeSettle("no")} disabled={settling}
                  className="py-2.5 text-xs font-bold uppercase tracking-wider bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25 active:scale-[0.98] disabled:opacity-50 transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}>Resolve NO</button>
              </div>
            </div>
          )}

          {/* Proposed — held in the dispute window */}
          {(settledProposal || inCreatorDisputeWindow) && !isResolved && (
            <div className="px-3.5 py-3 flex flex-col gap-1.5 bg-surface border border-border" style={{ borderRadius: "var(--radius-card)" }}>
              <p className="text-[11px] uppercase tracking-wider font-bold text-foreground">
                Proposed: {(settledProposal ?? market.creatorProposedWinner)?.toUpperCase()}
              </p>
              <p className="text-[10px] text-muted-foreground/80">
                Held for 24h while bettors can dispute. If enough do, it voids and refunds; otherwise it settles on this call.
              </p>
            </div>
          )}

          {/* Resolution info banner — shows when market is resolved */}
          {isResolved && (
            <div
              className={cn(
                "border px-3 py-3 flex flex-col gap-2",
                market.resolved?.winner === "yes"
                  ? "bg-success/5 border-success/20"
                  : "bg-danger/5 border-danger/20"
              )}
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-[9px] uppercase tracking-wider font-semibold block mb-0.5",
                    market.resolved?.winner === "yes" ? "text-success/70" : "text-danger/70"
                  )}>
                    Resolved {market.resolved?.winner === "yes" ? "YES" : "NO"}
                  </span>
                  {market.resolved?.note && (
                    <p className="text-xs text-foreground/80 leading-snug">{market.resolved.note}</p>
                  )}
                  {!market.resolved?.note && market.resolutionCriteria && (
                    <p className="text-xs text-muted-foreground leading-snug">{market.resolutionCriteria}</p>
                  )}
                </div>
              </div>

              {/* Auto-resolved badge + source — the "Kalshi-style" trust signal */}
              {resMeta.label && (
                <div className="flex items-center gap-1.5 py-1.5 px-2 bg-background/60 border border-border/60" style={{ borderRadius: "var(--radius-badge)" }}>
                  <ShieldCheck className="w-3 h-3 text-success/70 shrink-0" />
                  <span className="text-[10px] text-muted-foreground leading-none">
                    Auto-resolved ✓ from{" "}
                    <span className="text-foreground font-medium">{resMeta.label}</span>
                  </span>
                </div>
              )}

              {/* Resolution log: source link + timestamp */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {market.resolved?.sourceUrl && (
                  <a
                    href={market.resolved.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View source
                  </a>
                )}
                {market.resolved?.resolvedAt && (
                  <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto">
                    {formatResolvedAt(market.resolved.resolvedAt)}
                  </span>
                )}
              </div>
              {/* Dispute button */}
              {isResolutionDisputeable && !disputeOpen && (
                <button
                  onClick={() => setDisputeOpen(true)}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-fit"
                >
                  <Flag className="w-3 h-3" />
                  Dispute resolution
                </button>
              )}
              {disputeOpen && (
                <div className="flex flex-col gap-2 pt-1">
                  <textarea
                    value={disputeText}
                    onChange={(e) => setDisputeText(e.target.value)}
                    placeholder="Explain why this resolution is incorrect (10–500 chars)…"
                    rows={2}
                    maxLength={510}
                    className="w-full bg-background border border-border px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
                    style={{ borderRadius: "var(--radius-card)" }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={submitDispute}
                      disabled={disputeText.trim().length < 10 || disputeSubmitting}
                      className={cn(
                        "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border transition-all",
                        disputeText.trim().length >= 10 && !disputeSubmitting
                          ? "bg-danger/10 border-danger/30 text-danger hover:bg-danger/20"
                          : "bg-muted/30 border-border text-muted-foreground cursor-not-allowed"
                      )}
                      style={{ borderRadius: "var(--radius-badge)" }}
                    >
                      {disputeSubmitting ? "Submitting…" : "Submit dispute"}
                    </button>
                    <button
                      onClick={() => { setDisputeOpen(false); setDisputeText("") }}
                      className="px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {disputeSubmitted && (
                <p className="text-[10px] text-success">Dispute submitted. We'll review it shortly.</p>
              )}

              {/* Share result card — shown when user has a bet on this market */}
              {market.userBet && !disputeOpen && (
                <button
                  onClick={() => setShowResultCard(true)}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-fit"
                >
                  <ImageIcon className="w-3 h-3" />
                  {market.userBet.side === market.resolved?.winner ? "Share your W" : "Share your call"}
                </button>
              )}
            </div>
          )}

          {/* Prediction result card overlay */}
          {showResultCard && market.userBet && isResolved && (
            <PredictionCardOverlay
              data={{
                marketTitle:  market.title,
                category:     market.category,
                side:         market.userBet.side,
                entryOdds:    market.yesPercent,
                won:          market.userBet.side === market.resolved?.winner,
                amount:       market.userBet.amount,
                username:     currentUsername ?? "anon",
              } satisfies PredictionResultData}
              onClose={() => setShowResultCard(false)}
            />
          )}

          {/* Probability tiles */}
          <div className="flex items-stretch gap-3">
            <div className="flex-1 flex flex-col items-center justify-center py-5 bg-success/5 border border-success/20" style={{ borderRadius: "var(--radius-card)" }}>
              <span className="font-mono text-5xl font-black text-success tabular-nums leading-none">{yesPercent.toFixed(1)}%</span>
              <span className="mt-1.5 text-[10px] text-success/60 uppercase tracking-widest font-semibold">YES</span>
              {!isResolved && yesPercent > 0 && yesPercent < 100 && (
                <span className="mt-1 text-[9px] text-success/40 font-mono">
                  {payoutMultiplier(yesPercent)} if correct
                </span>
              )}
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-5 bg-danger/5 border border-danger/20" style={{ borderRadius: "var(--radius-card)" }}>
              <span className="font-mono text-5xl font-black text-danger tabular-nums leading-none">{noPercent.toFixed(1)}%</span>
              <span className="mt-1.5 text-[10px] text-danger/60 uppercase tracking-widest font-semibold">NO</span>
              {!isResolved && noPercent > 0 && noPercent < 100 && (
                <span className="mt-1 text-[9px] text-danger/40 font-mono">
                  {payoutMultiplier(noPercent)} if correct
                </span>
              )}
            </div>
          </div>

          {/* Odds bar */}
          <div className="relative h-1.5 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
            <div className="absolute inset-y-0 left-0 bg-success transition-all duration-700" style={{ width: `${yesPercent}%` }} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 divide-x divide-border border border-border" style={{ borderRadius: "var(--radius-card)" }}>
            <div className="flex flex-col items-center py-2.5 px-2">
              <span className="font-mono text-sm font-bold text-foreground tabular-nums">{formatCredits(market.totalCredits)}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Volume</span>
            </div>
            <div className="flex flex-col items-center py-2.5 px-2">
              <span className="font-mono text-sm font-bold text-foreground tabular-nums">
                {loading ? "—" : signals.traderCount}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Traders</span>
            </div>
            <div className="flex flex-col items-center py-2.5 px-2">
              <Countdown endTime={new Date(market.endTime)} resolved={isResolved} className="text-sm font-bold" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Time Left</span>
            </div>
          </div>

          {/* ── Crowd Activity ── */}
          {!loading && signals.traderCount > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Crowd Activity</span>
              </div>

              {/* Signal tiles */}
              <div className="grid grid-cols-2 gap-2">
                <SignalTile
                  label="Total Traders"
                  value={`${signals.traderCount} ${signals.traderCount === 1 ? 'trader' : 'traders'}`}
                />
                {signals.activityLabel
                  ? <SignalTile label="Last Hour" value={signals.activityLabel} tone={signals.recentCount >= 8 ? "alert" : "neutral"} />
                  : signals.recentCount > 0
                  ? <SignalTile label="Last Hour" value={`${signals.recentCount} trade${signals.recentCount > 1 ? 's' : ''}`} />
                  : <SignalTile label="Last Hour" value="Quiet" />
                }
                {signals.pressureLabel
                  ? <SignalTile
                      label="Momentum"
                      value={signals.pressureLabel}
                      tone={signals.recentYesPct !== null
                        ? signals.recentYesPct >= 60 ? "yes" : signals.recentYesPct <= 40 ? "no" : "neutral"
                        : "neutral"}
                    />
                  : signals.crowdLabel
                  ? <SignalTile
                      label="Sentiment"
                      value={signals.crowdLabel}
                      tone={yesPercent > 55 ? "yes" : yesPercent < 45 ? "no" : "alert"}
                    />
                  : null
                }
                {signals.hasWhale && signals.whaleDirection && (
                  <SignalTile
                    label="Whale Activity"
                    value={`Large ${signals.whaleDirection.toUpperCase()} position`}
                    tone="whale"
                  />
                )}
              </div>

              {/* Trader distribution */}
              {signals.traderCount >= 3 && (
                <div className="bg-surface border border-border px-3 py-3" style={{ borderRadius: "var(--radius-button)" }}>
                  <TraderDistribution
                    yesBetterCount={signals.yesBetterCount}
                    noBetterCount={signals.noBetterCount}
                  />
                </div>
              )}

              {/* Recent lean strip */}
              {signals.recentYesPct !== null && signals.recentCount >= 3 && (
                <div
                  className="bg-surface border border-border px-3 py-2.5 flex items-center justify-between gap-3"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">Last hour lean</span>
                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <span className={cn(
                      "text-xs font-semibold font-mono",
                      signals.recentYesPct >= 60 ? "text-success"
                      : signals.recentYesPct <= 40 ? "text-danger"
                      : "text-muted-foreground"
                    )}>
                      {signals.recentYesPct.toFixed(0)}% YES
                    </span>
                    <div className="w-16 h-1 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
                      <div
                        className={cn(
                          "h-full transition-all duration-500",
                          signals.recentYesPct >= 60 ? "bg-success/70"
                          : signals.recentYesPct <= 40 ? "bg-danger/70"
                          : "bg-muted-foreground/50"
                        )}
                        style={{ width: `${signals.recentYesPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Probability chart */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Probability History</span>
              </div>
              {chartData.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold font-mono tabular-nums" style={{ color: chartColor }}>
                    {chartNowPct.toFixed(1)}%
                  </span>
                  {chartDelta !== 0 && (
                    <span className={cn("text-[10px] font-mono font-semibold tabular-nums", chartDelta > 0 ? "text-success" : "text-danger")}>
                      {chartDelta > 0 ? "+" : ""}{chartDelta.toFixed(1)}pp
                    </span>
                  )}
                </div>
              )}
            </div>
            {chartData.length > 1 ? (
              <div className="bg-surface border border-border overflow-hidden px-1 pt-3 pb-1" style={{ borderRadius: "var(--radius-card)" }}>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="yesGradGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}    />
                      </linearGradient>
                      <linearGradient id="yesGradRed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <ReferenceLine y={50} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                    <XAxis dataKey="ts" hide />
                    <YAxis domain={[chartMin, chartMax]} hide />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="y"
                      stroke={chartColor}
                      strokeWidth={2}
                      fill={`url(#${chartGradId})`}
                      dot={false}
                      activeDot={{ r: 3, fill: chartColor, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex justify-between px-2 pb-1">
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {fmtChartTime(chartData[0].ts)}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">Now</span>
                </div>
              </div>
            ) : (
              <div className="bg-surface border border-border px-4 py-6 text-center" style={{ borderRadius: "var(--radius-card)" }}>
                <p className="text-xs text-muted-foreground">No history yet — be the first to trade</p>
              </div>
            )}
          </div>

          {/* Your position */}
          {!market.userBet && market.autoBet && (
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-accent/5 border border-accent/30" style={{ borderRadius: "var(--radius-button)" }}>
              <div className="min-w-0">
                <p className="text-[10px] text-accent uppercase tracking-widest font-semibold mb-0.5">⏱ Auto-bet armed</p>
                <p className="text-xs font-mono text-foreground">
                  Buys <span className="font-bold">{market.autoBet.side.toUpperCase()}</span> at <span className="font-bold">{market.autoBet.targetPercent}%</span> · {formatCredits(market.autoBet.amount)} CR held
                </p>
              </div>
              <button
                onClick={() => onCancelAutoBet?.(market.id)}
                className="shrink-0 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 active:scale-[0.97] transition-all"
                style={{ borderRadius: "var(--radius-button)" }}
              >
                Cancel
              </button>
            </div>
          )}

          {market.userBet && (
            <div className="flex flex-col gap-2.5 px-4 py-3 bg-accent/5 border border-accent/30" style={{ borderRadius: "var(--radius-button)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-accent uppercase tracking-widest font-semibold mb-0.5">Your Position</p>
                  <p className="text-sm font-mono font-bold text-foreground">{market.userBet.side.toUpperCase()} · {formatCredits(market.userBet.amount)} CR</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Current odds</p>
                  <p className="font-mono text-sm font-bold text-accent">{market.userBet.side === "yes" ? yesPercent.toFixed(1) : noPercent.toFixed(1)}%</p>
                </div>
              </div>

              {/* Live value: what the position is worth to sell now vs its max payout */}
              {cashoutValue != null && (market.userBet.shares ?? market.userBet.payout) != null && (
                <div className="flex items-center justify-between text-[11px] font-mono pt-0.5 border-t border-accent/15">
                  <span className="text-muted-foreground">Worth now <span className="font-bold text-foreground">{formatCredits(cashoutValue)}</span></span>
                  <span className="text-muted-foreground">Up to <span className="font-bold text-foreground">{formatCredits(Math.round(market.userBet.shares ?? market.userBet.payout ?? 0))}</span> if {market.userBet.side.toUpperCase()}</span>
                </div>
              )}

              {/* Cash out — close the position early at its current value */}
              {cashoutValue != null && (
                <button
                  onClick={() => (confirmCashout ? handleCashout() : setConfirmCashout(true))}
                  disabled={cashingOut}
                  className={cn(
                    "w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider border transition-all active:scale-[0.98] disabled:opacity-50",
                    confirmCashout
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-surface border-border text-foreground hover:border-accent/50"
                  )}
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  {cashingOut
                    ? "Cashing out…"
                    : confirmCashout
                    ? `Confirm — take ${formatCredits(cashoutValue)} CR`
                    : `Cash Out · ${formatCredits(cashoutValue)} CR`}
                </button>
              )}
              {cashoutValue != null && !cashingOut && (
                <p className="text-[10px] text-muted-foreground/70 text-center -mt-1">
                  {confirmCashout
                    ? "Closes your position now — tap again to confirm"
                    : `Lock in ${cashoutValue >= market.userBet.amount ? "a profit" : "what's left"} before it resolves`}
                </p>
              )}
            </div>
          )}

          {/* Recent trades */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Recent Trades</span>
            </div>
            {bets.length === 0 ? (
              <div className="px-4 py-5 text-center bg-surface border border-border" style={{ borderRadius: "var(--radius-card)" }}>
                <p className="text-xs text-muted-foreground">No trades yet. Open a position.</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border border border-border overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}>
                {bets.slice(0, 8).map((bet) => (
                  <div key={bet.id} className="flex items-center justify-between px-3 py-2.5 bg-surface">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar username={bet.username} avatarUrl={bet.avatarUrl} size={22} className="shrink-0" />
                      {bet.side === "yes"
                        ? <TrendingUp className="w-3 h-3 text-success shrink-0" />
                        : <TrendingDown className="w-3 h-3 text-danger shrink-0" />
                      }
                      <button
                        onClick={() => onUsernameClick?.(bet.username)}
                        className="text-xs text-foreground font-medium truncate hover:text-accent transition-colors"
                      >
                        @{bet.username}
                      </button>
                      <span
                        className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5", bet.side === "yes" ? "text-success bg-success/10" : "text-danger bg-danger/10")}
                        style={{ borderRadius: "var(--radius-badge)" }}
                      >
                        {bet.side.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-xs font-mono font-semibold text-foreground">{formatCredits(bet.amount)} CR</p>
                      <p className="text-[10px] text-muted-foreground">{timeAgo(bet.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <MarketComments
            marketId={market.id}
            currentUsername={currentUsername ?? null}
            currentAvatarUrl={currentAvatarUrl ?? null}
            onUsernameClick={onUsernameClick}
          />

        </div>
        )} {/* end loading ternary */}
      </div>

      {/* Bottom action bar */}
      {!isResolved && !market.userBet && (
        <div className={cn(
          "shrink-0 bg-background/95 backdrop-blur-sm border-t border-border",
          !isPanel && "fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50"
        )}
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          {/* Live probability split bar */}
          <div className="px-4 pt-3 pb-2.5 flex items-center gap-3">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs font-mono font-bold text-success">{yesPercent.toFixed(1)}%</span>
              <span className="text-[10px] text-muted-foreground">YES</span>
            </div>
            <div className="flex-1 h-1 overflow-hidden bg-muted" style={{ borderRadius: "9999px" }}>
              <div
                className="h-full bg-gradient-to-r from-success to-success/70 transition-all duration-700"
                style={{ width: `${yesPercent}%` }}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] text-muted-foreground">NO</span>
              <span className="text-xs font-mono font-bold text-danger">{noPercent.toFixed(1)}%</span>
            </div>
          </div>

          {/* YES / NO buttons — oversized for thumb comfort */}
          <div className="px-4 pb-1 flex gap-3">
            <button
              onClick={onBuyYes}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-4 bg-success text-success-foreground font-black text-base uppercase tracking-wide transition-all duration-[80ms] hover:bg-success/90 active:scale-[0.96] active:opacity-80"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-widest">
                <TrendingUp className="w-4 h-4" /> YES
              </span>
              <span className="text-[11px] font-normal opacity-80 lowercase tracking-normal">
                pays {payoutMultiplier(yesPercent)}
              </span>
            </button>
            <button
              onClick={onBuyNo}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-4 bg-danger text-danger-foreground font-black text-base uppercase tracking-wide transition-all duration-[80ms] hover:bg-danger/90 active:scale-[0.96] active:opacity-80"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-widest">
                <TrendingDown className="w-4 h-4" /> NO
              </span>
              <span className="text-[11px] font-normal opacity-80 lowercase tracking-normal">
                pays {payoutMultiplier(noPercent)}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Resolved banner */}
      {isResolved && (
        <div
          className={cn(
            "shrink-0 border-t px-4 py-3 text-center font-bold text-sm uppercase tracking-widest",
            market.resolved?.winner === "yes" ? "bg-success/20 border-success/30 text-success" : "bg-danger/20 border-danger/30 text-danger",
            !isPanel && "fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50"
          )}
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          {market.resolved?.winner === "yes" ? "YES Won" : "NO Won"} — Market Resolved
        </div>
      )}

      {/* Whale progressive tip */}
      {!isPanel && (
        <ProgressiveTip
          show={!loading && signals.hasWhale && !ob.whaleTipDone}
          icon={Fish}
          title="Whale Alert"
          body="A large position was placed on this market. Whales often have strong conviction — but can also be wrong. Use this as a signal, not a guarantee."
          onDismiss={() => completeOb("whaleTipDone")}
        />
      )}
    </div>
  )
}
