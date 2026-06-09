"use client"

import { useState, useEffect, useCallback } from "react"
import { Trophy, Flame, TrendingUp, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/ui/user-avatar"

type SortMode = "credits" | "winrate" | "streak"

interface LeaderboardEntry {
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

interface LeaderboardScreenProps {
  onUsernameClick?: (username: string) => void
}

const TABS: { id: SortMode; label: string; icon: React.ElementType }[] = [
  { id: "credits",  label: "Credits",  icon: Trophy },
  { id: "winrate",  label: "Win Rate", icon: TrendingUp },
  { id: "streak",   label: "Streak",   icon: Flame },
]

const MEDAL = ["🥇", "🥈", "🥉"]

function formatCredits(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return v.toLocaleString()
}

// ── Podium (top 3) ────────────────────────────────────────────────────────────
function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const [first, second, third] = entries
  if (!first) return null

  // Reorder: 2nd | 1st | 3rd
  const podiumOrder = [second, first, third].filter(Boolean)
  const heights = second ? ["h-20", "h-28", "h-16"] : ["h-28"]

  return (
    <div className="flex items-end justify-center gap-3 pt-6 pb-4 px-4">
      {podiumOrder.map((entry, i) => {
        const isFirst = entry.rank === 1
        const height = heights[i]
        return (
          <div key={entry.id} className="flex flex-col items-center gap-1.5 flex-1 max-w-[100px]">
            {/* Avatar + medal */}
            <div className="relative">
              <UserAvatar username={entry.username} avatarUrl={entry.avatarUrl} size={isFirst ? 52 : 40} />
              <span className="absolute -bottom-1 -right-1 text-base leading-none">
                {MEDAL[entry.rank - 1]}
              </span>
            </div>
            {/* Name */}
            <p className={cn(
              "text-[10px] font-semibold truncate w-full text-center",
              entry.isCurrentUser ? "text-accent" : "text-foreground"
            )}>
              @{entry.username}
            </p>
            {/* Podium block */}
            <div
              className={cn(
                "w-full flex items-center justify-center",
                height,
                isFirst
                  ? "bg-accent/20 border border-accent/40"
                  : "bg-surface border border-border"
              )}
              style={{ borderRadius: "var(--radius-card) var(--radius-card) 0 0" }}
            >
              <span className={cn(
                "font-mono text-xs font-bold tabular-nums",
                isFirst ? "text-accent" : "text-muted-foreground"
              )}>
                #{entry.rank}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Single row ────────────────────────────────────────────────────────────────
function Row({
  entry,
  sort,
  onUsernameClick,
}: {
  entry: LeaderboardEntry
  sort: SortMode
  onUsernameClick?: (u: string) => void
}) {
  const statValue =
    sort === "winrate" ? `${entry.winRate}%` :
    sort === "streak"  ? `🔥 ${entry.streak}` :
    formatCredits(entry.credits)

  const statLabel =
    sort === "winrate" ? "Win Rate" :
    sort === "streak"  ? "Streak"   :
    "Credits"

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0",
      entry.isCurrentUser ? "bg-accent/5" : "hover:bg-muted/20 transition-colors"
    )}>
      {/* Rank */}
      <span className={cn(
        "w-6 text-center font-mono text-sm font-bold shrink-0",
        entry.rank === 1 ? "text-yellow-400" :
        entry.rank === 2 ? "text-slate-300"  :
        entry.rank === 3 ? "text-orange-400" :
        "text-muted-foreground"
      )}>
        {entry.rank <= 3 ? MEDAL[entry.rank - 1] : `#${entry.rank}`}
      </span>

      {/* Avatar + name */}
      <button
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
        onClick={() => onUsernameClick?.(entry.username)}
      >
        <UserAvatar username={entry.username} avatarUrl={entry.avatarUrl} size={32} />
        <div className="min-w-0">
          <p className={cn(
            "text-sm font-medium truncate",
            entry.isCurrentUser ? "text-accent" : "text-foreground"
          )}>
            @{entry.username}
            {entry.isCurrentUser && (
              <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wider text-accent/70">you</span>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {entry.totalBets} bet{entry.totalBets !== 1 ? "s" : ""}
            {entry.streak >= 3 && ` · 🔥 ${entry.streak}`}
          </p>
        </div>
      </button>

      {/* Stat */}
      <div className="text-right shrink-0">
        <p className={cn(
          "font-mono text-sm font-bold tabular-nums",
          sort === "winrate" && entry.winRate >= 60 ? "text-success" :
          sort === "winrate" && entry.winRate <= 40 ? "text-danger" :
          sort === "streak" ? "text-orange-400" :
          "text-foreground"
        )}>
          {statValue}
        </p>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{statLabel}</p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function LeaderboardScreen({ onUsernameClick }: LeaderboardScreenProps) {
  const [sort, setSort] = useState<SortMode>("credits")
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [userEntry, setUserEntry] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (s: SortMode) => {
    setLoading(true)
    const res = await fetch(`/api/leaderboard?sort=${s}&limit=50`)
    if (res.ok) {
      const data = await res.json()
      // Support both old (array) and new (object) response shape
      if (Array.isArray(data)) {
        setLeaderboard(data)
        setUserEntry(null)
      } else {
        setLeaderboard(data.leaderboard ?? [])
        setUserEntry(data.userEntry ?? null)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(sort) }, [load, sort])

  const top3 = leaderboard.slice(0, 3)
  const rest = leaderboard.slice(3)

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Header */}
      <div className="shrink-0 px-4 pt-5 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-accent" />
          <h1 className="text-base font-bold text-foreground">Leaderboard</h1>
        </div>

        {/* Sort tabs */}
        <div className="flex gap-1.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSort(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-all duration-[80ms]",
                sort === id
                  ? "bg-accent text-accent-foreground border-accent"
                  : "bg-surface text-muted-foreground border-border hover:border-muted-foreground/40 hover:text-foreground"
              )}
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              <Icon className="w-3 h-3" />
              {label}
            </button>
          ))}
          {loading && (
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground/50 animate-spin ml-auto self-center" />
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && leaderboard.length === 0 ? (
          <div className="flex flex-col gap-3 px-4 pt-6 animate-pulse">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton w-6 h-4" />
                <div className="skeleton w-8 h-8 rounded-full" />
                <div className="skeleton flex-1 h-4" />
                <div className="skeleton w-14 h-4" />
              </div>
            ))}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Trophy className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No rankings yet</p>
            <p className="text-xs text-muted-foreground/60">Place bets to appear on the leaderboard</p>
          </div>
        ) : (
          <>
            {/* Podium — only for credits sort */}
            {sort === "credits" && <Podium entries={top3} />}

            {/* Full list */}
            <div
              className="mx-4 mb-4 overflow-hidden border border-border bg-surface"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              {(sort === "credits" ? rest : leaderboard).map((entry) => (
                <Row key={entry.id} entry={entry} sort={sort} onUsernameClick={onUsernameClick} />
              ))}
            </div>

            {/* Current user pinned at bottom if outside top 50 */}
            {userEntry && (
              <div className="px-4 pb-6">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">Your Rank</p>
                <div
                  className="overflow-hidden border border-accent/30 bg-accent/5"
                  style={{ borderRadius: "var(--radius-card)" }}
                >
                  <Row entry={userEntry} sort={sort} onUsernameClick={onUsernameClick} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
