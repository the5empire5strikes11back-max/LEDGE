"use client"

import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"
import { Flame, Zap } from "lucide-react"

// Rank definitions with premium styling
const RANKS = {
  rookie: {
    label: "Rookie",
    color: "text-[#6B6B7B]",
    bg: "bg-[#202028]",
    border: "border-[#2A2A32]",
    icon: "◆",
    gradient: null,
    glow: false,
  },
  forecaster: {
    label: "Forecaster",
    color: "text-[#3B82F6]",
    bg: "bg-[#3B82F6]/10",
    border: "border-[#3B82F6]/30",
    icon: "◈",
    gradient: null,
    glow: false,
  },
  analyst: {
    label: "Analyst",
    color: "text-[#A855F7]",
    bg: "bg-[#A855F7]/10",
    border: "border-[#A855F7]/30",
    icon: "❖",
    gradient: null,
    glow: false,
  },
  oracle: {
    label: "Oracle",
    color: "text-accent",
    bg: "bg-accent/10",
    border: "border-accent/30",
    icon: "✦",
    gradient: null,
    glow: false,
  },
  marketMaker: {
    label: "Market Maker",
    color: "text-accent",
    bg: "bg-accent/15",
    border: "border-accent/50",
    icon: "✧",
    gradient: "from-white via-[#E2E8F0] to-white",
    glow: true,
  },
  juryLead: {
    label: "Jury Lead",
    color: "text-white",
    bg: "bg-white/15",
    border: "border-white/50",
    icon: "★",
    gradient: "from-[#E2E8F0] via-white to-[#E2E8F0]",
    glow: true,
  },
} as const

type RankKey = keyof typeof RANKS

interface UserProfileCardProps {
  username: string
  avatarUrl?: string
  rank: RankKey
  credits: number
  winRate: number
  streak: number
  xp: number
  xpToNextRank: number
  isPlus?: boolean
  isInactive?: boolean
  className?: string
}

// Animated credit counter
function CreditTicker({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (hasAnimated.current) return
    hasAnimated.current = true

    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Easing function - ease out cubic
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      const currentValue = Math.floor(value * easeOutCubic)

      setDisplayValue(currentValue)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [value, duration])

  const formatCredits = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toLocaleString()
  }

  return (
    <span className="font-mono tabular-nums text-2xl font-bold text-foreground">
      {formatCredits(displayValue)}
    </span>
  )
}

// Premium rank badge component
function RankAchievementBadge({ rank }: { rank: RankKey }) {
  const config = RANKS[rank]

  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-semibold uppercase tracking-wider transition-all",
        config.bg,
        config.border,
        config.color,
        config.glow && "animate-pulse-subtle"
      )}
      style={{ borderRadius: "var(--radius-badge)" }}
    >
      {/* Gradient overlay for premium ranks */}
      {config.gradient && (
        <div
          className={cn(
            "absolute inset-0 rounded opacity-20 bg-gradient-to-r",
            config.gradient
          )}
          style={{ borderRadius: "var(--radius-badge)" }}
        />
      )}

      {/* Icon with glow for premium ranks */}
      <span
        className={cn(
          "relative text-sm",
          config.glow && "drop-shadow-[0_0_4px_currentColor]"
        )}
      >
        {config.icon}
      </span>

      <span className="relative">{config.label}</span>

      {/* Corner accents for premium ranks */}
      {config.glow && (
        <>
          <span className="absolute -top-px -left-px w-2 h-2 border-t border-l border-current opacity-50" style={{ borderRadius: "2px 0 0 0" }} />
          <span className="absolute -top-px -right-px w-2 h-2 border-t border-r border-current opacity-50" style={{ borderRadius: "0 2px 0 0" }} />
          <span className="absolute -bottom-px -left-px w-2 h-2 border-b border-l border-current opacity-50" style={{ borderRadius: "0 0 0 2px" }} />
          <span className="absolute -bottom-px -right-px w-2 h-2 border-b border-r border-current opacity-50" style={{ borderRadius: "0 0 2px 0" }} />
        </>
      )}
    </div>
  )
}

// XP Progress bar
function XPProgressBar({ current, max }: { current: number; max: number }) {
  const percentage = Math.min((current / max) * 100, 100)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">XP to next rank</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div
        className="h-2 bg-muted/50 overflow-hidden"
        style={{ borderRadius: "var(--radius-badge)" }}
      >
        <div
          className="h-full bg-gradient-to-r from-accent/80 to-accent transition-all duration-500"
          style={{ width: `${percentage}%`, borderRadius: "var(--radius-badge)" }}
        />
      </div>
    </div>
  )
}

// Avatar with initials fallback
function Avatar({ username, avatarUrl }: { username: string; avatarUrl?: string }) {
  const initials = username
    .split(/[._-]/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  if (avatarUrl) {
    return (
      <div
        className="w-14 h-14 rounded-full overflow-hidden border-2 border-border"
      >
        <img
          src={avatarUrl}
          alt={username}
          className="w-full h-full object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className="w-14 h-14 rounded-full bg-surface border-2 border-border flex items-center justify-center"
    >
      <span className="text-lg font-semibold text-muted-foreground">{initials}</span>
    </div>
  )
}

// Decay warning indicator
function DecayWarning() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-danger/10 border border-danger/30 text-danger text-xs rounded" style={{ borderRadius: "var(--radius-badge)" }}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-danger" />
      </span>
      <span className="font-medium">Rank decay in 3 days — place a bet to stay active</span>
    </div>
  )
}

export function UserProfileCard({
  username,
  avatarUrl,
  rank,
  credits,
  winRate,
  streak,
  xp,
  xpToNextRank,
  isPlus = false,
  isInactive = false,
  className,
}: UserProfileCardProps) {
  return (
    <div
      className={cn(
        "bg-card border p-5 card-glow transition-all",
        isPlus
          ? "border-accent/60 shadow-[0_0_20px_rgba(245,166,35,0.15)]"
          : "border-border",
        className
      )}
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Header: Avatar + Username + Rank */}
      <div className="flex items-start gap-4 mb-5">
        <div className="relative">
          <Avatar username={username} avatarUrl={avatarUrl} />
          {isPlus && (
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 bg-accent flex items-center justify-center"
              style={{ borderRadius: "var(--radius-badge)" }}
              title="Ledge Plus"
            >
              <Zap className="w-2.5 h-2.5 text-accent-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-lg font-semibold truncate">@{username}</h3>
            {isPlus && (
              <span
                className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 bg-accent/20 text-accent border border-accent/40 shrink-0"
                style={{ borderRadius: "var(--radius-badge)" }}
              >
                PLUS
              </span>
            )}
          </div>
          <RankAchievementBadge rank={rank} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {/* Credits */}
        <div className="col-span-2 bg-surface/50 border border-border/50 p-3 rounded" style={{ borderRadius: "var(--radius-button)" }}>
          <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Credits</span>
          <CreditTicker value={credits} />
        </div>

        {/* Streak */}
        <div className="bg-surface/50 border border-border/50 p-3 rounded" style={{ borderRadius: "var(--radius-button)" }}>
          <span className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Streak</span>
          {streak > 0 ? (
            <div className="flex items-center gap-1">
              <Flame className="w-5 h-5 text-accent shrink-0 streak-flame" />
              <span className="font-mono text-2xl font-bold text-accent tabular-nums">{streak}</span>
            </div>
          ) : (
            <span className="font-mono text-2xl font-bold text-muted-foreground tabular-nums">—</span>
          )}
        </div>
      </div>

      {/* Win Rate */}
      <div className="flex items-center justify-between py-3 border-t border-border/50">
        <span className="text-sm text-muted-foreground">Win Rate</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-muted/50 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                winRate >= 60 ? "bg-success" : winRate >= 50 ? "bg-accent" : "bg-danger"
              )}
              style={{ width: `${winRate}%` }}
            />
          </div>
          <span className={cn(
            "font-mono text-sm font-semibold tabular-nums",
            winRate >= 60 ? "text-success" : winRate >= 50 ? "text-accent" : "text-danger"
          )}>
            {winRate}%
          </span>
        </div>
      </div>

      {/* XP Progress */}
      <div className="pt-3 border-t border-border/50">
        <XPProgressBar current={xp} max={xpToNextRank} />
      </div>

      {/* Decay Warning */}
      {isInactive && (
        <div className="mt-4">
          <DecayWarning />
        </div>
      )}
    </div>
  )
}

// Export rank types for external use
export type { RankKey }
export { RANKS }
