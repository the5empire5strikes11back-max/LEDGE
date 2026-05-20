"use client"

import { cn } from "@/lib/utils"
import type { Achievement, AchievementRarity } from "@/lib/achievements"

const RARITY_STYLES: Record<AchievementRarity, { bg: string; border: string; label: string }> = {
  common:    { bg: "bg-muted/50",           border: "border-border",         label: "text-muted-foreground" },
  rare:      { bg: "bg-[#3B82F6]/10",       border: "border-[#3B82F6]/30",   label: "text-[#60A5FA]" },
  epic:      { bg: "bg-[#A855F7]/10",       border: "border-[#A855F7]/30",   label: "text-[#C084FC]" },
  legendary: { bg: "bg-accent/10",          border: "border-accent/50",      label: "text-accent" },
}

interface AchievementsGridProps {
  earned: Achievement[]
}

export function AchievementsGrid({ earned }: AchievementsGridProps) {
  if (earned.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-3">
        Win your first bet to start earning badges.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {earned.map((a) => {
        const s = RARITY_STYLES[a.rarity]
        return (
          <div
            key={a.id}
            className={cn(
              "flex flex-col items-center gap-1 px-2 py-3 border text-center",
              s.bg, s.border
            )}
            style={{ borderRadius: "var(--radius-card)" }}
            title={a.description}
          >
            <span className="text-2xl leading-none">{a.emoji}</span>
            <span className={cn("text-[10px] font-bold uppercase tracking-wider leading-tight", s.label)}>
              {a.label}
            </span>
            <span className={cn("text-[8px] uppercase tracking-widest opacity-70", s.label)}>
              {a.rarity}
            </span>
          </div>
        )
      })}
    </div>
  )
}
