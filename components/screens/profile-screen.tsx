"use client"

import { useState, useEffect, useRef } from "react"
import { SettingsSheet } from "@/components/settings-sheet"
import { LeaderboardRow } from "@/components/leaderboard-row"
import { Sparkline } from "@/components/ui/sparkline"
import { AchievementsGrid } from "@/components/achievements-grid"
import { xpProgress } from "@/lib/game-engine"
import { Settings, TrendingUp, AlertTriangle, Share2, Camera, Loader2 } from "lucide-react"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import type { Persona } from "@/lib/game-engine"
import type { Achievement } from "@/lib/achievements"
import { cn } from "@/lib/utils"
import { ShareCardModal } from "@/components/share-card"
import { UserAvatar } from "@/components/ui/user-avatar"
import { compressToSquare } from "@/lib/compress-image"

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
}

interface LeaderboardEntry {
  rank: number
  username: string
  credits: number
  streak: number
  winRate: number
  pnl: number
  isCurrentUser: boolean
}

interface PnlPoint {
  credits: number
  created_at: string
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}


export function ProfileScreen({
  xp, rank, credits, streak, persona, decay, username, avatarUrl: initialAvatarUrl, isPlus = false
}: ProfileScreenProps) {
  const progress = xpProgress(xp)
  const rankConfig = RANKS[rank]
  const [stats, setStats] = useState<UserStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [pnlHistory, setPnlHistory] = useState<PnlPoint[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/stats').then((r) => r.ok ? r.json() : null).then((d) => d && setStats(d))
    fetch('/api/leaderboard').then((r) => r.ok ? r.json() : null).then((d) => d && setLeaderboard(d))
    fetch('/api/pnl-history').then((r) => r.ok ? r.json() : null).then((d) => d && setPnlHistory(d))
  }, [])

  const pnlDelta = pnlHistory.length >= 2
    ? pnlHistory[pnlHistory.length - 1].credits - pnlHistory[0].credits
    : null

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError(null)
    setAvatarUploading(true)
    try {
      const blob = await compressToSquare(file, 400)
      const compressed = new File([blob], "avatar.jpg", { type: "image/jpeg" })
      const form = new FormData()
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Profile</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShareOpen(true)}
              className="p-1.5 text-muted-foreground hover:text-accent transition-colors"
              title="Share identity card"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4 lg:max-w-3xl lg:mx-auto">

          {/* Identity — compact, information-dense */}
          <div
            className={cn(
              "bg-card border px-4 py-4",
              isPlus ? "border-accent/50" : "border-border"
            )}
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <div className="flex items-center gap-3">
              {/* Tappable avatar with camera overlay */}
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleAvatarChange}
                />
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
                {/* Rank + persona on one line */}
                <div className="flex items-center gap-2 mt-1">
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
                </div>
              </div>
              {/* Credits — primary value */}
              <div className="text-right shrink-0">
                <span className="font-mono text-lg font-bold text-foreground tabular-nums">
                  {formatCredits(credits)}
                </span>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">CR</p>
              </div>
            </div>

            {/* Streak (only if active) */}
            {streak > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Login streak</span>
                <span className="font-mono text-xs font-bold text-accent">{streak}d 🔥</span>
              </div>
            )}
          </div>

          {/* Avatar upload error */}
          {avatarError && (
            <p className="text-xs text-danger px-1">{avatarError}</p>
          )}

          {/* Decay warning — factual, not dramatic */}
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

          {/* Performance stats + sparkline — side by side on desktop */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-4 lg:space-y-0">
            {/* Performance stats */}
            <div className="grid grid-cols-4 lg:grid-cols-2 gap-2">
              {[
                {
                  label: "Win Rate",
                  value: stats ? `${stats.winRate}%` : "—",
                  color: stats
                    ? stats.winRate >= 60 ? "text-success"
                    : stats.winRate >= 50 ? "text-accent"
                    : "text-danger"
                    : "text-foreground",
                },
                { label: "Markets", value: stats?.marketsPlayed ?? "—", color: "text-foreground" },
                { label: "Correct", value: stats?.correct ?? "—", color: "text-foreground" },
                { label: "Best Run", value: stats?.bestStreak ?? "—", color: "text-foreground" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-card border border-border px-2 py-3 text-center"
                  style={{ borderRadius: "var(--radius-card)" }}
                >
                  <span className={cn("text-base font-bold font-mono tabular-nums", stat.color)}>
                    {stat.value}
                  </span>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5 leading-tight">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Wealth history sparkline */}
            <div
              className="bg-card border border-border px-4 py-4"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Wealth History
                  </span>
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

          {/* Global leaderboard — prominent */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                Global Leaderboard
              </span>
              {stats?.leaderboardRank && (
                <span className="text-xs font-mono text-accent font-semibold">
                  You're #{stats.leaderboardRank}
                </span>
              )}
            </div>
            <div
              className="bg-card border border-border overflow-hidden"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              {leaderboard.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-muted-foreground">No players yet — be the first!</p>
                </div>
              ) : (
                leaderboard.map((row) => (
                  <LeaderboardRow
                    key={row.rank}
                    rank={row.rank}
                    username={row.username}
                    avatarUrl={(row as { avatarUrl?: string }).avatarUrl ?? null}
                    credits={row.credits}
                    streak={row.streak}
                    winRate={row.winRate}
                    pnl={row.pnl}
                    isCurrentUser={row.isCurrentUser}
                  />
                ))
              )}
            </div>
          </div>

          {/* XP progress — metadata, not the hero */}
          <div
            className="bg-card border border-border px-4 py-3"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                XP · {rankConfig.label}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {progress.current.toLocaleString()} / {progress.required.toLocaleString()}
              </span>
            </div>
            <div className="relative h-1 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
              <div
                className="absolute inset-y-0 left-0 bg-accent transition-all duration-700"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            {progress.nextRank && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {(progress.required - progress.current).toLocaleString()} XP to {progress.nextRank}
              </p>
            )}
          </div>

          {/* Achievements — compact */}
          {(stats?.achievements?.length ?? 0) > 0 && (
            <div
              className="bg-card border border-border px-4 py-4"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  Achievements
                </span>
                <span className="text-xs text-accent font-semibold">
                  {stats?.achievements.length} earned
                </span>
              </div>
              <AchievementsGrid earned={stats?.achievements ?? []} />
            </div>
          )}

          {/* Ledge Plus — understated upsell */}
          {!isPlus && (
            <div
              className="border border-border bg-surface px-4 py-4 flex items-center justify-between"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <div>
                <p className="text-sm font-semibold text-foreground">Ledge Plus</p>
                <p className="text-xs text-muted-foreground mt-0.5">2× daily credits · Early features</p>
              </div>
              <button
                className="px-3 py-1.5 bg-accent text-accent-foreground text-xs font-semibold uppercase tracking-wider hover:bg-accent/90 transition-all shrink-0"
                style={{ borderRadius: "var(--radius-button)" }}
              >
                $39/yr
              </button>
            </div>
          )}

          <div className="pb-4" />
        </div>
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        username={username}
      />

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
