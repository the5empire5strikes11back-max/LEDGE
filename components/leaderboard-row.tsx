"use client"

import { cn } from "@/lib/utils"
import { RankBadge, StreakBadge } from "@/components/ui/rank-badge"
import { Ticker, TickerPercent } from "@/components/ui/ticker"
import { UserAvatar } from "@/components/ui/user-avatar"

interface LeaderboardRowProps {
  rank: number
  username: string
  avatarUrl?: string | null
  credits: number
  winRate: number
  pnl: number
  streak?: number
  isCurrentUser?: boolean
  className?: string
}

export function LeaderboardRow({
  rank,
  username,
  avatarUrl,
  credits,
  winRate,
  pnl,
  streak,
  isCurrentUser,
  className,
}: LeaderboardRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 border-b border-border hover:bg-secondary/50 active:bg-muted transition-colors duration-[80ms]",
        isCurrentUser && "bg-accent/5 border-l-2 border-l-accent",
        className
      )}
    >
      {/* Rank */}
      <RankBadge rank={rank} />

      {/* User */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <UserAvatar username={username} avatarUrl={avatarUrl} size={32} />
        <div className="flex flex-col min-w-0">
          <span className={cn("text-sm font-medium truncate", isCurrentUser && "text-accent")}>
            @{username}
          </span>
          {streak && streak >= 3 && <StreakBadge streak={streak} className="mt-0.5 w-fit" />}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-right">
        <div className="w-20">
          <span className="text-[10px] text-muted-foreground uppercase block">Credits</span>
          <span className="font-mono text-sm tabular-nums">
            <Ticker value={credits} decimals={0} />
          </span>
        </div>
        <div className="w-16">
          <span className="text-[10px] text-muted-foreground uppercase block">Win Rate</span>
          <span className="font-mono text-sm tabular-nums">{winRate}%</span>
        </div>
        <div className="w-20">
          <span className="text-[10px] text-muted-foreground uppercase block">P&L</span>
          <TickerPercent value={pnl} className="text-sm justify-end" />
        </div>
      </div>
    </div>
  )
}
