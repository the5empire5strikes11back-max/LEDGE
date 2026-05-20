"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import { Button } from "@/components/ui/button"

// Member data structure
interface CircleMember {
  id: string
  username: string
  avatarUrl?: string
  rank: RankKey
  credits: number
  weeklyChange: number // positive or negative
  isCurrentUser?: boolean
  wasOvertaken?: boolean // show notification
  previousPosition?: number // for position change animation
}

interface CircleLeaderboardProps {
  circleName: string
  members: CircleMember[]
  onInvite?: () => void
  className?: string
}

// Rank badge compact version
function CompactRankBadge({ rank }: { rank: RankKey }) {
  const config = RANKS[rank]
  
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded",
        config.bg,
        config.border,
        config.color,
        "border"
      )}
      style={{ borderRadius: "var(--radius-badge)" }}
    >
      <span className={cn(config.glow && "drop-shadow-[0_0_3px_currentColor]")}>
        {config.icon}
      </span>
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  )
}

// Avatar with initials fallback
function MemberAvatar({ username, avatarUrl, size = "sm" }: { username: string; avatarUrl?: string; size?: "sm" | "md" }) {
  const initials = username
    .split(/[._-]/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const sizeClasses = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm"

  if (avatarUrl) {
    return (
      <div className={cn("rounded-full overflow-hidden border border-border", sizeClasses)}>
        <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div className={cn("rounded-full bg-surface border border-border flex items-center justify-center font-medium text-muted-foreground", sizeClasses)}>
      {initials}
    </div>
  )
}

// Animated credit counter
function AnimatedCredits({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0)
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (hasAnimated.current) return
    hasAnimated.current = true

    const startTime = performance.now()
    const duration = 800

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeOutCubic = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.floor(value * easeOutCubic))

      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [value])

  const formatCredits = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toLocaleString()
  }

  return <span className="font-mono tabular-nums">{formatCredits(displayValue)}</span>
}

// Weekly change indicator with animation
function WeeklyChange({ value, animate = false }: { value: number; animate?: boolean }) {
  const isPositive = value >= 0
  const [show, setShow] = useState(!animate)

  useEffect(() => {
    if (animate) {
      const timer = setTimeout(() => setShow(true), 300)
      return () => clearTimeout(timer)
    }
  }, [animate])

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 font-mono text-sm tabular-nums transition-all duration-300",
        isPositive ? "text-success" : "text-danger",
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      )}
    >
      <span className="text-xs">{isPositive ? "▲" : "▼"}</span>
      <span>{Math.abs(value).toLocaleString()}</span>
    </div>
  )
}

// Position badge with medal colors for top 3
function PositionBadge({ position, previousPosition }: { position: number; previousPosition?: number }) {
  const [animating, setAnimating] = useState(false)
  const moved = previousPosition !== undefined && previousPosition !== position
  const movedUp = previousPosition !== undefined && previousPosition > position

  useEffect(() => {
    if (moved) {
      setAnimating(true)
      const timer = setTimeout(() => setAnimating(false), 600)
      return () => clearTimeout(timer)
    }
  }, [moved])

  // Medal colors for top 3
  const getMedalStyle = () => {
    switch (position) {
      case 1:
        return "bg-gradient-to-br from-[#FFD700] via-[#FFF8DC] to-[#FFD700] text-black shadow-[0_0_8px_rgba(255,215,0,0.4)]"
      case 2:
        return "bg-gradient-to-br from-[#C0C0C0] via-[#E8E8E8] to-[#C0C0C0] text-black shadow-[0_0_6px_rgba(192,192,192,0.3)]"
      case 3:
        return "bg-gradient-to-br from-[#CD7F32] via-[#E9A96C] to-[#CD7F32] text-black shadow-[0_0_6px_rgba(205,127,50,0.3)]"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <div className="relative flex items-center">
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
          getMedalStyle(),
          animating && "scale-110"
        )}
      >
        {position}
      </div>
      {/* Position change indicator */}
      {moved && (
        <div
          className={cn(
            "absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold",
            movedUp ? "bg-success text-success-foreground" : "bg-danger text-danger-foreground",
            animating && "animate-bounce"
          )}
        >
          {movedUp ? "▲" : "▼"}
        </div>
      )}
    </div>
  )
}

// Overtaken notification banner
function OvertakenBanner() {
  return (
    <div className="absolute -top-px left-0 right-0 h-0.5 bg-danger animate-pulse" />
  )
}

// Single leaderboard row
function LeaderboardMemberRow({
  member,
  position,
  index,
}: {
  member: CircleMember
  position: number
  index: number
}) {
  // Left border accent colors for top 3
  const getLeftAccent = () => {
    if (member.isCurrentUser) return "border-l-accent"
    switch (position) {
      case 1: return "border-l-[#FFD700]"
      case 2: return "border-l-[#C0C0C0]"
      case 3: return "border-l-[#CD7F32]"
      default: return "border-l-transparent"
    }
  }

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 px-4 py-3 border-b border-border/50 transition-all duration-200",
        "hover:bg-secondary/30",
        "border-l-2",
        getLeftAccent(),
        member.isCurrentUser && "bg-accent/5",
        member.wasOvertaken && "bg-danger/5"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Overtaken notification */}
      {member.wasOvertaken && <OvertakenBanner />}

      {/* Position */}
      <PositionBadge position={position} previousPosition={member.previousPosition} />

      {/* Avatar */}
      <MemberAvatar username={member.username} avatarUrl={member.avatarUrl} />

      {/* User info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium truncate",
              member.isCurrentUser && "text-accent"
            )}
          >
            @{member.username}
          </span>
          {member.isCurrentUser && (
            <span className="text-[10px] text-accent uppercase tracking-wider font-semibold">You</span>
          )}
        </div>
        <CompactRankBadge rank={member.rank} />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-right">
        <div className="w-20">
          <span className="text-[10px] text-muted-foreground uppercase block">Credits</span>
          <span className="text-sm font-semibold">
            <AnimatedCredits value={member.credits} />
          </span>
        </div>
        <div className="w-16">
          <span className="text-[10px] text-muted-foreground uppercase block">7d</span>
          <WeeklyChange value={member.weeklyChange} animate />
        </div>
      </div>

      {/* Overtaken warning icon */}
      {member.wasOvertaken && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="relative">
            <span className="absolute inset-0 animate-ping rounded-full bg-danger/50" />
            <span className="relative flex h-2 w-2 rounded-full bg-danger" />
          </div>
        </div>
      )}
    </div>
  )
}

// Empty state component
function EmptyState({ memberCount, onInvite }: { memberCount: number; onInvite?: () => void }) {
  return (
    <div className="py-12 px-6 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface border-2 border-dashed border-border flex items-center justify-center">
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold mb-2">Your Circle needs more members</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto text-balance">
        Invite at least {3 - memberCount} more friend{3 - memberCount > 1 ? "s" : ""} to unlock the leaderboard and start competing.
      </p>
      <Button
        onClick={onInvite}
        className="bg-accent text-accent-foreground hover:bg-accent/90"
        style={{ borderRadius: "var(--radius-button)" }}
      >
        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Invite Friends
      </Button>
    </div>
  )
}

// Live indicator
function LiveIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
      </span>
      <span className="uppercase tracking-wider font-medium">Live</span>
    </div>
  )
}

export function CircleLeaderboard({
  circleName,
  members,
  onInvite,
  className,
}: CircleLeaderboardProps) {
  const sortedMembers = [...members].sort((a, b) => b.credits - a.credits)
  const isEmpty = members.length < 3

  return (
    <div
      className={cn(
        "bg-card border border-border overflow-hidden card-glow",
        className
      )}
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Circle icon */}
          <div className="w-9 h-9 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
            <span className="text-accent text-sm font-bold">
              {circleName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h3 className="text-sm font-semibold">{circleName}</h3>
            <span className="text-xs text-muted-foreground">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <LiveIndicator />
      </div>

      {/* Content */}
      {isEmpty ? (
        <EmptyState memberCount={members.length} onInvite={onInvite} />
      ) : (
        <div className="divide-y divide-border/30">
          {sortedMembers.map((member, index) => (
            <LeaderboardMemberRow
              key={member.id}
              member={member}
              position={index + 1}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Footer - only show if not empty */}
      {!isEmpty && (
        <div className="px-4 py-2.5 bg-surface/50 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Updated just now
          </span>
          <button className="text-xs text-accent hover:text-accent/80 font-medium transition-colors">
            View Full Rankings
          </button>
        </div>
      )}
    </div>
  )
}
