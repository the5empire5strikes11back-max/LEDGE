import { cn } from "@/lib/utils"
import { Flame } from "lucide-react"

type RankTier = "gold" | "silver" | "bronze" | "default"

interface RankBadgeProps {
  rank: number
  className?: string
}

function getRankTier(rank: number): RankTier {
  if (rank === 1) return "gold"
  if (rank === 2) return "silver"
  if (rank === 3) return "bronze"
  return "default"
}

export function RankBadge({ rank, className }: RankBadgeProps) {
  const tier = getRankTier(rank)

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[28px] h-6 px-2 text-xs font-semibold rounded",
        tier === "gold" && "badge-rank-gold",
        tier === "silver" && "badge-rank-silver",
        tier === "bronze" && "badge-rank-bronze",
        tier === "default" && "bg-muted text-muted-foreground",
        className
      )}
      style={{ borderRadius: "var(--radius-badge)" }}
    >
      #{rank}
    </span>
  )
}

interface StreakBadgeProps {
  streak: number
  className?: string
}

export function StreakBadge({ streak, className }: StreakBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 h-6 text-xs font-medium bg-accent/10 text-accent rounded",
        className
      )}
      style={{ borderRadius: "var(--radius-badge)" }}
    >
      <Flame className="w-3 h-3" />{streak}
    </span>
  )
}
