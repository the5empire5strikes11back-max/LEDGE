"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { SettingsSheet } from "@/components/settings-sheet"
import { Sparkline } from "@/components/ui/sparkline"
import { AchievementsGrid } from "@/components/achievements-grid"
import { Ticker } from "@/components/ui/ticker"
import { CollapsibleSection } from "@/components/ui/collapsible-section"
import { xpProgress } from "@/lib/game-engine"
import {
  Settings, TrendingUp, AlertTriangle, Share2, Camera, Loader2,
  CheckCircle2, XCircle, Clock, ExternalLink, Flame, ShieldCheck,
  Zap, Gift, Star, RefreshCw, Trophy,
} from "lucide-react"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import type { Persona } from "@/lib/game-engine"
import type { Achievement } from "@/lib/achievements"
import { cn } from "@/lib/utils"
import { ShareCardModal } from "@/components/share-card"
import { UserAvatar } from "@/components/ui/user-avatar"
import { compressToSquare } from "@/lib/compress-image"
import { CreatorAnalytics } from "@/components/creator-analytics"
import type { CreatorMarket } from "@/app/api/creator/markets/route"

// ── Types ─────────────────────────────────────────────────────────────────────

type LbSort   = "credits" | "winrate" | "streak"
type LbView   = "global"  | "near-me"
type LbPeriod = "all"     | "week"    | "month"

interface LbEntry {
  rank: number
  id: string
  username: string
  avatarUrl?: string | null
  credits: number
  rankLabel: string
  streak: number
  winRate: number
  pnl: number
  totalBets: number
  isCurrentUser: boolean
}

const LB_SORT_TABS: { id: LbSort; label: string }[] = [
  { id: "credits",  label: "Credits"  },
  { id: "winrate",  label: "Win Rate" },
  { id: "streak",   label: "Streak"   },
]

const LB_MEDAL = ["🥇", "🥈", "🥉"]

interface ProfileScreenProps {
  xp: number
  rank: RankKey
  credits: number
  streak: number
  vetoes: number
  persona: Persona
  decay: "none" | "warning" | "critical"
  username: string
  avatarUrl?: string | null
  isPlus?: boolean
  onOpenShop?: () => void
  onUsernameClick?: (username: string) => void
}

interface UserStats {
  marketsPlayed: number
  correct: number
  bestStreak: number
  currentWinStreak: number
  winRate: number
  achievements: Achievement[]
  leaderboardRank: number | null
  top10Gap: number | null
  followersCount?: number
  followingCount?: number
  creatorStats?: {
    liveMarkets: number
    reviewMarkets: number
    trustScore: number
    trustTier: "trusted" | "normal" | "restricted"
  }
}

interface PnlPoint {
  credits: number
  created_at: string
}

interface BetRecord {
  id: string
  side: "yes" | "no"
  amount: number
  payout: number | null
  won: boolean | null
  created_at: string
  markets: { title: string; category: string } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

// ── Ledge Plus cards ──────────────────────────────────────────────────────────

const PLUS_PERKS = [
  { icon: Zap,         label: "2× daily credits",    detail: "500 → 1,000 CR/day" },
  { icon: Gift,        label: "Monthly bonus drop",  detail: "2,000 CR on the 1st" },
  { icon: ShieldCheck, label: "Streak shields",      detail: "Never lose your streak" },
  { icon: Star,        label: "Exclusive Plus badge", detail: "Stand out on the leaderboard" },
]

function PlusUpsellCard() {
  const [loading, setLoading] = useState(false)
  const handleUpgrade = async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/stripe/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type: "plus" }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">Ledge Plus</span>
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-accent/20 text-accent border border-accent/30"
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              PLUS
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Everything you need to dominate the leaderboard.
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xl font-bold text-accent font-mono">$20</span>
          <p className="text-[10px] text-muted-foreground">/year</p>
          <p className="text-[9px] text-muted-foreground/50">$1.67/mo</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {PLUS_PERKS.map((p) => (
          <div key={p.label} className="flex items-start gap-1.5">
            <p.icon className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] text-foreground font-medium leading-tight">{p.label}</p>
              <p className="text-[10px] text-muted-foreground/60 leading-tight">{p.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className={cn(
          "w-full py-2.5 bg-accent text-accent-foreground text-xs font-bold uppercase tracking-wider",
          "hover:bg-accent/90 active:scale-[0.98] active:opacity-80 transition-all duration-[80ms]",
          "disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
        )}
        style={{ borderRadius: "var(--radius-button)" }}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Upgrade for $20/year"}
      </button>
      <p className="text-[10px] text-muted-foreground/40 text-center mt-1.5">
        Cancel anytime · Instant access
      </p>
    </div>
  )
}

function PlusManageCard() {
  const [loading, setLoading] = useState(false)
  const handlePortal = async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/stripe/portal", { method: "POST" })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-bold text-success">✦ Ledge Plus</span>
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-1 py-0.5 bg-success/15 text-success border border-success/30"
            style={{ borderRadius: "var(--radius-badge)" }}
          >
            Active
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">2× daily credits · Streak shields · Monthly bonus</p>
      </div>
      <button
        onClick={handlePortal}
        disabled={loading}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground active:opacity-70 transition-colors shrink-0 disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
        Manage
      </button>
    </div>
  )
}

// ── Embedded leaderboard row ──────────────────────────────────────────────────

function LbRow({
  entry,
  sort,
  onUsernameClick,
}: {
  entry: LbEntry
  sort: LbSort
  onUsernameClick?: (u: string) => void
}) {
  const statValue =
    sort === "winrate" ? `${entry.winRate}%` :
    sort === "streak"  ? `🔥 ${entry.streak}` :
    formatCredits(entry.credits)

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0",
      entry.isCurrentUser ? "bg-accent/5" : "hover:bg-muted/10 transition-colors duration-[80ms]"
    )}>
      <span className={cn(
        "w-6 text-center font-mono text-xs font-bold shrink-0",
        entry.rank === 1 ? "text-yellow-400" :
        entry.rank === 2 ? "text-slate-300"  :
        entry.rank === 3 ? "text-orange-400" :
        "text-muted-foreground/50"
      )}>
        {entry.rank <= 3 ? LB_MEDAL[entry.rank - 1] : `#${entry.rank}`}
      </span>
      <button
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
        onClick={() => onUsernameClick?.(entry.username)}
      >
        <UserAvatar username={entry.username} avatarUrl={entry.avatarUrl} size={28} />
        <p className={cn(
          "text-xs font-medium truncate",
          entry.isCurrentUser ? "text-accent" : "text-foreground"
        )}>
          @{entry.username}
          {entry.isCurrentUser && (
            <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wider text-accent/70">you</span>
          )}
        </p>
      </button>
      <p className={cn(
        "font-mono text-xs font-bold tabular-nums shrink-0",
        sort === "winrate" && entry.winRate >= 60 ? "text-success" :
        sort === "winrate" && entry.winRate <= 40 ? "text-danger"  :
        sort === "streak"  ? "text-orange-400" :
        "text-foreground"
      )}>
        {statValue}
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ProfileScreen({
  xp, rank, credits, streak, persona, decay,
  username, avatarUrl: initialAvatarUrl, isPlus = false,
  onOpenShop, onUsernameClick,
}: ProfileScreenProps) {
  const progress    = xpProgress(xp)
  const rankConfig  = RANKS[rank]

  const [stats,          setStats]          = useState<UserStats | null>(null)
  const [pnlHistory,     setPnlHistory]     = useState<PnlPoint[]>([])
  const [bets,           setBets]           = useState<BetRecord[]>([])
  const [creatorMarkets, setCreatorMarkets] = useState<CreatorMarket[]>([])
  const [settingsOpen,   setSettingsOpen]   = useState(false)
  const [shareOpen,      setShareOpen]      = useState(false)
  const [avatarUrl,      setAvatarUrl]      = useState<string | null>(initialAvatarUrl ?? null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError,    setAvatarError]    = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Embedded leaderboard state
  const [lbSort,       setLbSort]       = useState<LbSort>("credits")
  const [lbView,       setLbView]       = useState<LbView>("global")
  const [lbPeriod,     setLbPeriod]     = useState<LbPeriod>("all")
  const [lbEntries,    setLbEntries]    = useState<LbEntry[]>([])
  const [lbUserEntry,  setLbUserEntry]  = useState<LbEntry | null>(null)
  const [lbPercentile, setLbPercentile] = useState<number | null>(null)
  const [lbLoading,    setLbLoading]    = useState(true)

  useEffect(() => {
    fetch("/api/stats").then((r) => r.ok ? r.json() : null).then((d) => d && setStats(d))
    fetch("/api/pnl-history").then((r) => r.ok ? r.json() : null).then((d) => d && setPnlHistory(d))
    fetch("/api/bets").then((r) => r.ok ? r.json() : null).then((d) => Array.isArray(d) && setBets(d))
    fetch("/api/creator/markets").then((r) => r.ok ? r.json() : []).then((d) => Array.isArray(d) && setCreatorMarkets(d))
  }, [])

  const loadLeaderboard = useCallback((sort: LbSort, view: LbView, period: LbPeriod) => {
    setLbLoading(true)
    const params = new URLSearchParams({ sort, limit: "25", view })
    if (sort === "winrate" && period !== "all") params.set("period", period)
    fetch(`/api/leaderboard?${params}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return
        if (Array.isArray(d)) {
          setLbEntries(d)
          setLbUserEntry(null)
          setLbPercentile(null)
        } else {
          setLbEntries(d.leaderboard ?? [])
          setLbUserEntry(d.userEntry ?? null)
          setLbPercentile(d.percentile ?? null)
        }
      })
      .catch(() => {})
      .finally(() => setLbLoading(false))
  }, [])

  useEffect(() => { loadLeaderboard(lbSort, lbView, lbPeriod) }, [loadLeaderboard, lbSort, lbView, lbPeriod])

  const pnlDelta = pnlHistory.length >= 2
    ? pnlHistory[pnlHistory.length - 1].credits - pnlHistory[0].credits
    : null

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    setAvatarUploading(true)
    try {
      const blob       = await compressToSquare(file, 400)
      const compressed = new File([blob], "avatar.jpg", { type: "image/jpeg" })
      const form       = new FormData()
      form.append("file", compressed)
      const res = await fetch("/api/user/avatar", { method: "POST", body: form })
      if (res.ok) {
        const data = await res.json()
        setAvatarUrl(data.avatar_url)
      } else {
        const err = await res.json().catch(() => ({}))
        setAvatarError(err.error ?? "Upload failed")
      }
    } catch {
      setAvatarError("Failed to process image")
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  // ── Calibration data (derived from bets) ──────────────────────────────────
  const TRACKED = ["Sports", "Politics", "Culture"] as const
  type TrackedCat = typeof TRACKED[number]

  const resolvedBets = bets.filter((b) => b.won !== null && b.markets?.category)
  const byCategory = TRACKED.reduce<Record<TrackedCat, { wins: number; total: number }>>(
    (acc, cat) => { acc[cat] = { wins: 0, total: 0 }; return acc },
    {} as Record<TrackedCat, { wins: number; total: number }>
  )
  for (const bet of resolvedBets) {
    const cat = bet.markets?.category as TrackedCat | undefined
    if (!cat || !byCategory[cat]) continue
    byCategory[cat].total += 1
    if (bet.won) byCategory[cat].wins += 1
  }
  const calibRows = TRACKED
    .map((cat) => ({
      cat,
      ...byCategory[cat],
      rate: byCategory[cat].total >= 3
        ? Math.round((byCategory[cat].wins / byCategory[cat].total) * 100)
        : null,
    }))
    .filter((r) => r.total >= 3)

  function masteryTier(wins: number, total: number): { label: string; tier: "gold" | "silver" | "bronze" } | null {
    if (total >= 15 && wins / total >= 0.70) return { label: "Gold",   tier: "gold"   }
    if (total >= 10 && wins / total >= 0.62) return { label: "Silver", tier: "silver" }
    if (total >= 5  && wins / total >= 0.55) return { label: "Bronze", tier: "bronze" }
    return null
  }
  const masteryStyle = {
    gold:   "bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/30",
    silver: "bg-[#94A3B8]/15 text-[#94A3B8] border border-[#94A3B8]/30",
    bronze: "bg-[#CD7F32]/15 text-[#CD7F32] border border-[#CD7F32]/30",
  } as const

  // leaderboard badge: show user's rank if known
  const lbBadge = stats?.leaderboardRank ? `#${stats.leaderboardRank}` : null

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Profile</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShareOpen(true)}
              className="p-1.5 text-muted-foreground hover:text-accent active:scale-[0.88] transition-all duration-[80ms]"
              title="Share identity card"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 text-muted-foreground hover:text-foreground active:scale-[0.88] transition-all duration-[80ms]"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3 lg:max-w-3xl lg:mx-auto">

          {/* ── Identity card — always visible, never collapsible ── */}
          <div
            className={cn("bg-card border px-4 py-4", isPlus ? "border-accent/50" : "border-border")}
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <div className="flex items-center gap-3">
              {/* Tappable avatar */}
              <div className="relative shrink-0 group">
                <UserAvatar username={username} avatarUrl={avatarUrl} size={44} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label="Change profile picture"
                  className={cn(
                    "absolute inset-0 rounded-full flex items-center justify-center transition-opacity",
                    "bg-black/55 opacity-0 group-hover:opacity-100 focus:opacity-100"
                  )}
                >
                  {avatarUploading
                    ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                    : <Camera className="w-4 h-4 text-white" />
                  }
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">@{username}</span>
                  {isPlus && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-accent/20 text-accent border border-accent/40 shrink-0"
                      style={{ borderRadius: "var(--radius-badge)" }}
                    >
                      PLUS
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border",
                      rankConfig.bg, rankConfig.border, rankConfig.color
                    )}
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    {rankConfig.icon} {rankConfig.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {persona.emoji} {persona.label}
                  </span>
                  {stats?.creatorStats?.trustTier === "trusted" &&
                   (stats.creatorStats.liveMarkets ?? 0) >= 3 && (
                    <span
                      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-success/15 text-success border border-success/30 shrink-0"
                      style={{ borderRadius: "var(--radius-badge)" }}
                    >
                      ✦ Trusted Creator
                    </span>
                  )}
                </div>

                {/* Followers / Following counts */}
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-mono font-bold text-foreground tabular-nums">{stats?.followersCount ?? 0}</span>
                    {" "}Followers
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-mono font-bold text-foreground tabular-nums">{stats?.followingCount ?? 0}</span>
                    {" "}Following
                  </span>
                </div>
              </div>

              {/* Credits */}
              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                <div>
                  <span className="font-mono text-lg font-bold text-foreground tabular-nums">
                    <Ticker value={credits} decimals={0} duration={800} />
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider ml-1">CR</span>
                </div>
                <button
                  onClick={onOpenShop}
                  className="text-[10px] font-bold px-2 py-0.5 bg-accent/15 text-accent hover:bg-accent/25 active:scale-[0.94] transition-all duration-[80ms]"
                  style={{ borderRadius: "var(--radius-badge)" }}
                >
                  + Buy Credits
                </button>
              </div>
            </div>

            {/* Streak */}
            {streak > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-accent">
                  <Flame className="w-3.5 h-3.5 shrink-0 streak-flame" />{streak}-day streak
                </span>
                {Math.min(Math.floor(streak / 7), 3) > 0 && (
                  <div className="flex items-center gap-0.5" title="Streak shields earned">
                    {Array.from({ length: Math.min(Math.floor(streak / 7), 3) }).map((_, i) => (
                      <ShieldCheck key={i} className="w-3.5 h-3.5 text-accent/70" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Avatar upload error */}
          {avatarError && <p className="text-xs text-danger px-1">{avatarError}</p>}

          {/* Decay warning */}
          {decay !== "none" && (
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 border",
                decay === "critical" ? "bg-danger/8 border-danger/25" : "bg-surface border-border"
              )}
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <AlertTriangle className={cn("w-3.5 h-3.5 shrink-0", decay === "critical" ? "text-danger" : "text-muted-foreground")} />
              <p className="text-xs text-muted-foreground">
                {decay === "critical"
                  ? "Rank decay active — place a bet to stop it."
                  : "Bet tomorrow to keep your streak."}
              </p>
            </div>
          )}

          {/* ── Stats ── */}
          <CollapsibleSection
            label="Stats"
            badge={stats ? `${stats.winRate}% wr · ${stats.marketsPlayed} played` : undefined}
            defaultOpen
            storageKey="profile_stats"
          >
            <div className="space-y-4">
              {/* 4-stat grid */}
              <div className="grid grid-cols-4 gap-2">
                {stats === null ? (
                  [0,1,2,3].map((i) => (
                    <div key={i} className="bg-surface border border-border/50 px-2 py-3 flex flex-col items-center gap-1.5" style={{ borderRadius: "var(--radius-card)" }}>
                      <div className="skeleton h-4 w-10" style={{ borderRadius: "var(--radius-badge)" }} />
                      <div className="skeleton h-2.5 w-8" style={{ borderRadius: "var(--radius-badge)" }} />
                    </div>
                  ))
                ) : (
                  [
                    { label: "Win Rate", value: `${stats.winRate}%`,         color: stats.winRate >= 60 ? "text-success" : stats.winRate >= 50 ? "text-accent" : "text-danger" },
                    { label: "Played",   value: String(stats.marketsPlayed), color: "text-foreground" },
                    { label: "Wins",     value: String(stats.correct),       color: "text-foreground" },
                    { label: "Best Run", value: String(stats.bestStreak),    color: "text-foreground" },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="bg-surface border border-border/50 px-2 py-3 text-center"
                      style={{ borderRadius: "var(--radius-card)" }}
                    >
                      <span className={cn("text-base font-bold font-mono tabular-nums", stat.color)}>
                        {stat.value}
                      </span>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5 leading-tight">
                        {stat.label}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Wealth sparkline */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3 h-3 text-muted-foreground/60" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Wealth History</span>
                  </div>
                  {pnlDelta !== null && (
                    <span className={cn("text-xs font-mono font-semibold", pnlDelta >= 0 ? "text-success" : "text-danger")}>
                      {pnlDelta >= 0 ? "+" : ""}{pnlDelta.toLocaleString()} CR
                    </span>
                  )}
                </div>
                <Sparkline data={pnlHistory} />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Leaderboard ── */}
          <CollapsibleSection
            label="Leaderboard"
            badge={lbBadge ?? undefined}
            defaultOpen
            storageKey="profile_leaderboard"
            noPadding
          >
            {/* Controls */}
            <div className="px-4 pt-3 pb-2 space-y-2">
              {/* Sort tabs */}
              <div className="flex gap-1.5">
                {LB_SORT_TABS.map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setLbSort(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-all duration-[80ms]",
                      lbSort === id
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-surface text-muted-foreground border-border hover:text-foreground"
                    )}
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    {label}
                  </button>
                ))}
                {lbLoading && (
                  <RefreshCw className="w-3.5 h-3.5 text-muted-foreground/50 animate-spin self-center ml-auto" />
                )}
              </div>

              {/* View + period */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["global", "near-me"] as LbView[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setLbView(v)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider border transition-all duration-[80ms]",
                      lbView === v
                        ? "bg-foreground/10 text-foreground border-foreground/20"
                        : "bg-transparent text-muted-foreground border-border hover:text-foreground"
                    )}
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    {v === "global" ? "Global" : "Near Me"}
                  </button>
                ))}
                {lbSort === "winrate" && (
                  <div className="flex gap-1 ml-auto">
                    {(["all", "week", "month"] as LbPeriod[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setLbPeriod(p)}
                        className={cn(
                          "px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border transition-all duration-[80ms]",
                          lbPeriod === p
                            ? "bg-foreground/10 text-foreground border-foreground/20"
                            : "bg-transparent text-muted-foreground border-border hover:text-foreground"
                        )}
                        style={{ borderRadius: "var(--radius-badge)" }}
                      >
                        {p === "all" ? "All" : p === "week" ? "7D" : "30D"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Percentile banner */}
              {lbPercentile !== null && (() => {
                const tier =
                  lbPercentile >= 95 ? { label: "Top 5%",  color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20" } :
                  lbPercentile >= 80 ? { label: "Top 20%", color: "text-accent",      bg: "bg-accent/10 border-accent/20" } :
                  lbPercentile >= 60 ? { label: "Top 40%", color: "text-success",     bg: "bg-success/10 border-success/20" } :
                  null
                return (
                  <div className="px-3 py-2 border bg-surface/50 flex items-center justify-between gap-3"
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    <span className="text-[11px] text-muted-foreground">
                      Better than <span className="text-foreground font-bold font-mono">{lbPercentile}%</span> of all players
                    </span>
                    {tier && (
                      <span className={cn(
                        "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border",
                        tier.color, tier.bg
                      )} style={{ borderRadius: "var(--radius-badge)" }}>
                        {tier.label}
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Rows */}
            {lbLoading && lbEntries.length === 0 ? (
              <div className="flex flex-col gap-3 px-4 py-4 animate-pulse">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton w-6 h-3" />
                    <div className="skeleton w-7 h-7 rounded-full" />
                    <div className="skeleton flex-1 h-3" />
                    <div className="skeleton w-12 h-3" />
                  </div>
                ))}
              </div>
            ) : lbEntries.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2">
                <Trophy className="w-8 h-8 text-muted-foreground/20" />
                <p className="text-xs text-muted-foreground">No rankings yet</p>
              </div>
            ) : (
              <div>
                {lbEntries.map((entry) => (
                  <LbRow key={entry.id} entry={entry} sort={lbSort} onUsernameClick={onUsernameClick} />
                ))}
                {lbUserEntry && lbView === "global" && (
                  <div className="px-4 pt-2 pb-3 border-t border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">Your Rank</p>
                    <div className="border border-accent/30 bg-accent/5 overflow-hidden" style={{ borderRadius: "var(--radius-badge)" }}>
                      <LbRow entry={lbUserEntry} sort={lbSort} onUsernameClick={onUsernameClick} />
                    </div>
                  </div>
                )}
                {lbView === "near-me" && (
                  <div className="px-4 py-2 border-t border-border/50">
                    <p className="text-[10px] text-muted-foreground/60">Showing players near your rank</p>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>

          {/* ── Rank Progress ── */}
          <CollapsibleSection
            label="Rank Progress"
            badge={`${progress.current.toLocaleString()} XP`}
            defaultOpen
            storageKey="profile_rank"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border",
                    rankConfig.bg, rankConfig.border, rankConfig.color
                  )}
                  style={{ borderRadius: "var(--radius-badge)" }}
                >
                  {rankConfig.icon} {rankConfig.label}
                </span>
                {progress.nextRank && (
                  <span className="text-[10px] text-muted-foreground">→ {progress.nextRank}</span>
                )}
              </div>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                <Ticker value={progress.current} decimals={0} duration={800} className="text-[10px]" />
                /{progress.required.toLocaleString()} XP
              </span>
            </div>
            <div className="relative h-1.5 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
              <div
                className="absolute inset-y-0 left-0 bg-accent transition-all duration-700"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            {progress.nextRank ? (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                {(progress.required - progress.current).toLocaleString()} XP to unlock {progress.nextRank}
              </p>
            ) : (
              <p className="text-[10px] text-accent mt-1.5 font-semibold">Max rank reached ✦</p>
            )}
            {(stats?.creatorStats?.liveMarkets ?? 0) > 0 && (
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                {stats!.creatorStats!.liveMarkets} market{stats!.creatorStats!.liveMarkets !== 1 ? "s" : ""} live
                {stats!.creatorStats!.reviewMarkets > 0 && (
                  <span> · {stats!.creatorStats!.reviewMarkets} pending review</span>
                )}
              </p>
            )}
          </CollapsibleSection>

          {/* ── Calibration — default collapsed ── */}
          {calibRows.length > 0 && (
            <CollapsibleSection
              label="Calibration"
              badge={`${calibRows.length} ${calibRows.length === 1 ? "category" : "categories"}`}
              defaultOpen={false}
              storageKey="profile_calibration"
            >
              <div className="space-y-3">
                {calibRows.map(({ cat, wins, total, rate }) => {
                  const pct       = rate ?? 0
                  const color     = pct >= 60 ? "bg-success" : pct >= 50 ? "bg-accent" : "bg-danger"
                  const textColor = pct >= 60 ? "text-success" : pct >= 50 ? "text-accent" : "text-danger"
                  const mastery   = masteryTier(wins, total)
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-foreground font-medium">{cat}</span>
                          {mastery && (
                            <span
                              className={cn("text-[9px] font-bold px-1 py-0.5", masteryStyle[mastery.tier])}
                              style={{ borderRadius: "var(--radius-badge)" }}
                            >
                              {mastery.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground/60 font-mono">{wins}/{total}</span>
                          <span className={cn("text-[11px] font-bold font-mono tabular-nums", textColor)}>{pct}%</span>
                        </div>
                      </div>
                      <div className="relative h-1 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
                        <div
                          className={cn("absolute inset-y-0 left-0 transition-all duration-700", color)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Achievements — default open ── */}
          {(stats?.achievements?.length ?? 0) > 0 && (
            <CollapsibleSection
              label="Achievements"
              badge={`${stats?.achievements.length} earned`}
              defaultOpen
              storageKey="profile_achievements"
            >
              <AchievementsGrid earned={stats?.achievements ?? []} />
            </CollapsibleSection>
          )}

          {/* ── My Markets — default collapsed ── */}
          {creatorMarkets.length > 0 && (
            <CollapsibleSection
              label="My Markets"
              badge={`${creatorMarkets.filter((m) => (m as { status?: string }).status === "live" || (m as { resolved?: boolean }).resolved === false).length || creatorMarkets.length} markets`}
              defaultOpen={false}
              storageKey="profile_markets"
            >
              <CreatorAnalytics markets={creatorMarkets} />
            </CollapsibleSection>
          )}

          {/* ── Bets Made — default collapsed ── */}
          {bets.length > 0 && (
            <CollapsibleSection
              label="Bets Made"
              badge={`${bets.length} bets`}
              defaultOpen={false}
              storageKey="profile_bets"
              noPadding
            >
              <div className="divide-y divide-border">
                {bets.map((bet) => {
                  const isPending = bet.won === null
                  const profit    = bet.won && bet.payout ? bet.payout - bet.amount : null
                  return (
                    <div key={bet.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        {isPending
                          ? <Clock className="w-3.5 h-3.5 text-muted-foreground/50" />
                          : bet.won
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            : <XCircle className="w-3.5 h-3.5 text-danger" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug line-clamp-2">
                          {bet.markets?.title ?? "Unknown market"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {bet.markets?.category && (
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {bet.markets.category}
                            </span>
                          )}
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-1 py-0.5",
                              bet.side === "yes" ? "text-success bg-success/10" : "text-danger bg-danger/10"
                            )}
                            style={{ borderRadius: "var(--radius-badge)" }}
                          >
                            {bet.side}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                          {bet.amount.toLocaleString()} CR
                        </span>
                        {profit !== null && (
                          <p className={cn("text-[10px] font-mono font-semibold tabular-nums", profit >= 0 ? "text-success" : "text-danger")}>
                            {profit >= 0 ? "+" : ""}{profit.toLocaleString()}
                          </p>
                        )}
                        {isPending && <p className="text-[10px] text-muted-foreground/50">pending</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Ledge Plus ── */}
          <CollapsibleSection
            label="Ledge Plus"
            badge={isPlus ? "Active ✦" : "$20/yr"}
            defaultOpen
            storageKey="profile_plus"
            className={isPlus ? "border-success/25" : "border-accent/25"}
          >
            {!isPlus ? <PlusUpsellCard /> : <PlusManageCard />}
          </CollapsibleSection>

          <div className="pb-4" />
        </div>
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} username={username} />

      {shareOpen && (
        <ShareCardModal
          username={username}
          xp={xp}
          rank={rank}
          credits={credits}
          streak={streak}
          persona={persona}
          winRate={stats?.winRate ?? 0}
          marketsPlayed={stats?.marketsPlayed ?? 0}
          leaderboardRank={stats?.leaderboardRank ?? null}
          bestStreak={stats?.bestStreak ?? streak}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}
