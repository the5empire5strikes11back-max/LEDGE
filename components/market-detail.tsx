"use client"

import { useState, useEffect, useCallback } from "react"
import { X, TrendingUp, TrendingDown, Activity, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { Countdown } from "@/components/ui/countdown"
import { computeDetailSignals } from "@/lib/social-signals"
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
    yesPercent: number
    yesPool: number
    noPool: number
    totalCredits: number
    hotScore?: number
    momentumShift?: number
    isFeatured?: boolean
    endTime: string
    resolved?: { winner: "yes" | "no" }
    userBet?: { side: "yes" | "no"; amount: number }
  }
  onClose: () => void
  onBuyYes: () => void
  onBuyNo: () => void
}

interface BetActivity {
  id: string
  username: string
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
    alert:   "text-amber-400",
    whale:   "text-accent",
  }
  return (
    <div
      className="flex flex-col gap-0.5 bg-surface border border-border px-3 py-2.5"
      style={{ borderRadius: "var(--radius-button)" }}
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

export function MarketDetail({ market, onClose, onBuyYes, onBuyNo }: MarketDetailProps) {
  const [bets, setBets]       = useState<BetActivity[]>([])
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)

  const isResolved  = !!market.resolved
  const isHot       = (market.hotScore ?? 0) >= 8
  const hasMomentum = (market.momentumShift ?? 0) >= 3
  const yesPercent  = market.yesPercent
  const noPercent   = 100 - yesPercent
  const totalPool   = market.yesPool + market.noPool

  const load = useCallback(async () => {
    const res = await fetch(`/api/markets/${market.id}/bets`)
    if (res.ok) {
      const data = await res.json()
      setBets((data.bets ?? []).slice().reverse())
      setHistory(data.history ?? [])
    }
    setLoading(false)
  }, [market.id])

  useEffect(() => { load() }, [load])

  // Social signals — computed from the full bets list (available after load)
  const signals = computeDetailSignals(
    bets.map((b) => ({ side: b.side, amount: b.amount, created_at: b.created_at })),
    yesPercent
  )

  const chartData = history.length > 0
    ? [...history.map((h, i) => ({ t: i, y: h.yesPercent })), { t: history.length, y: yesPercent }]
    : [{ t: 0, y: yesPercent }]

  const chartMin = Math.max(0, Math.min(...chartData.map((d) => d.y)) - 5)
  const chartMax = Math.min(100, Math.max(...chartData.map((d) => d.y)) + 5)

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in slide-in-from-bottom-full duration-300">

      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 h-[57px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 border",
              market.category === "Sports"   ? "bg-[#3B82F6]/15 text-[#60A5FA] border-[#3B82F6]/30"
              : market.category === "Politics" ? "bg-[#8B5CF6]/15 text-[#A78BFA] border-[#8B5CF6]/30"
              : market.category === "Culture"  ? "bg-[#EC4899]/15 text-[#F472B6] border-[#EC4899]/30"
              :                                  "bg-accent/15 text-accent border-accent/30"
            )}
            style={{ borderRadius: "var(--radius-badge)" }}
          >
            {market.category}
          </span>
          {isHot && (
            <span className="shrink-0 text-[9px] font-black text-orange-400 uppercase tracking-wider px-1.5 py-0.5 bg-orange-500/15 border border-orange-500/30 animate-pulse" style={{ borderRadius: "var(--radius-badge)" }}>
              🔥 HOT
            </span>
          )}
          {hasMomentum && !isHot && (
            <span className="shrink-0 text-[9px] font-bold text-accent uppercase tracking-wider px-1.5 py-0.5 bg-accent/10 border border-accent/20" style={{ borderRadius: "var(--radius-badge)" }}>
              ↑{market.momentumShift}% MOVING
            </span>
          )}
        </div>
        <button onClick={onClose} className="shrink-0 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 flex flex-col gap-5">

          <h1 className="text-base font-semibold text-foreground leading-snug">{market.title}</h1>

          {/* Probability tiles */}
          <div className="flex items-stretch gap-3">
            <div className="flex-1 flex flex-col items-center justify-center py-5 bg-success/5 border border-success/20" style={{ borderRadius: "var(--radius-card)" }}>
              <span className="font-mono text-5xl font-black text-success tabular-nums leading-none">{yesPercent.toFixed(1)}%</span>
              <span className="mt-1.5 text-[10px] text-success/60 uppercase tracking-widest font-semibold">YES</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-5 bg-danger/5 border border-danger/20" style={{ borderRadius: "var(--radius-card)" }}>
              <span className="font-mono text-5xl font-black text-danger tabular-nums leading-none">{noPercent.toFixed(1)}%</span>
              <span className="mt-1.5 text-[10px] text-danger/60 uppercase tracking-widest font-semibold">NO</span>
            </div>
          </div>

          {/* Odds bar */}
          <div className="relative h-1.5 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
            <div className="absolute inset-y-0 left-0 bg-success transition-all duration-700" style={{ width: `${yesPercent}%` }} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 divide-x divide-border border border-border" style={{ borderRadius: "var(--radius-button)" }}>
            <div className="flex flex-col items-center py-2.5 px-2">
              <span className="font-mono text-sm font-bold text-foreground tabular-nums">{formatCredits(market.totalCredits)}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Volume</span>
            </div>
            <div className="flex flex-col items-center py-2.5 px-2">
              <span className="font-mono text-sm font-bold text-foreground tabular-nums">{formatCredits(totalPool)}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Pool</span>
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
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Probability History</span>
            </div>
            {chartData.length > 1 ? (
              <div className="bg-surface border border-border overflow-hidden px-1 pt-3 pb-1" style={{ borderRadius: "var(--radius-card)" }}>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={chartData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}   />
                      </linearGradient>
                    </defs>
                    <ReferenceLine y={50} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                    <XAxis dataKey="t" hide />
                    <YAxis domain={[chartMin, chartMax]} hide />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="y" stroke="#22c55e" strokeWidth={2} fill="url(#yesGrad)" dot={false} activeDot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex justify-between px-2 pb-1">
                  <span className="text-[9px] text-muted-foreground font-mono">Start</span>
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
          {market.userBet && (
            <div className="flex items-center justify-between px-4 py-3 bg-accent/5 border border-accent/30" style={{ borderRadius: "var(--radius-button)" }}>
              <div>
                <p className="text-[10px] text-accent uppercase tracking-widest font-semibold mb-0.5">Your Position</p>
                <p className="text-sm font-mono font-bold text-foreground">{market.userBet.side.toUpperCase()} · {formatCredits(market.userBet.amount)} CR</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Current odds</p>
                <p className="font-mono text-sm font-bold text-accent">{market.userBet.side === "yes" ? yesPercent.toFixed(1) : noPercent.toFixed(1)}%</p>
              </div>
            </div>
          )}

          {/* Recent trades */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Recent Trades</span>
            </div>
            {loading ? (
              <div className="py-6 flex justify-center">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : bets.length === 0 ? (
              <div className="px-4 py-5 text-center bg-surface border border-border" style={{ borderRadius: "var(--radius-card)" }}>
                <p className="text-xs text-muted-foreground">No trades yet. Open a position.</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border border border-border overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}>
                {bets.slice(0, 8).map((bet) => (
                  <div key={bet.id} className="flex items-center justify-between px-3 py-2.5 bg-surface">
                    <div className="flex items-center gap-2 min-w-0">
                      {bet.side === "yes"
                        ? <TrendingUp className="w-3.5 h-3.5 text-success shrink-0" />
                        : <TrendingDown className="w-3.5 h-3.5 text-danger shrink-0" />
                      }
                      <span className="text-xs text-foreground font-medium truncate">@{bet.username}</span>
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

        </div>
      </div>

      {/* Bottom action bar */}
      {!isResolved && !market.userBet && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 bg-background border-t border-border px-4 py-3 flex gap-3">
          <button onClick={onBuyYes} className="flex-1 flex items-center justify-center gap-2 py-3 bg-success text-success-foreground font-bold text-sm uppercase tracking-wide transition-all hover:bg-success/90" style={{ borderRadius: "var(--radius-button)" }}>
            <TrendingUp className="w-4 h-4" />
            Buy YES · {yesPercent.toFixed(0)}¢
          </button>
          <button onClick={onBuyNo} className="flex-1 flex items-center justify-center gap-2 py-3 bg-danger text-danger-foreground font-bold text-sm uppercase tracking-wide transition-all hover:bg-danger/90" style={{ borderRadius: "var(--radius-button)" }}>
            <TrendingDown className="w-4 h-4" />
            Buy NO · {noPercent.toFixed(0)}¢
          </button>
        </div>
      )}

      {/* Resolved banner */}
      {isResolved && (
        <div className={cn(
          "fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 border-t px-4 py-3 text-center font-bold text-sm uppercase tracking-widest",
          market.resolved?.winner === "yes" ? "bg-success/20 border-success/30 text-success" : "bg-danger/20 border-danger/30 text-danger"
        )}>
          {market.resolved?.winner === "yes" ? "YES Won" : "NO Won"} — Market Resolved
        </div>
      )}
    </div>
  )
}
