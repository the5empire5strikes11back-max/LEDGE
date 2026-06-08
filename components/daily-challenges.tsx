"use client"

import { useState, useEffect } from "react"
import { CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DailyChallenge } from "@/app/api/challenges/route"

interface DailyChallengesProps {
  /** Called after a challenge is shown (for logging / animations) */
  onLoaded?: (challenges: DailyChallenge[]) => void
}

export function DailyChallenges({ onLoaded }: DailyChallengesProps) {
  const [challenges, setChallenges] = useState<DailyChallenge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/challenges')
      .then((r) => r.ok ? r.json() : [])
      .then((data: DailyChallenge[]) => {
        setChallenges(data)
        onLoaded?.(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [onLoaded])

  if (loading) {
    return (
      <div className="px-4 pt-2 pb-1">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="skeleton shrink-0 w-[130px] h-[64px]"
              style={{ borderRadius: "var(--radius-card)", animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (challenges.length === 0) return null

  const allDone = challenges.every((c) => c.completed)
  const totalXp = challenges.reduce((s, c) => s + (c.completed ? c.xp : 0), 0)
  const maxXp   = challenges.reduce((s, c) => s + c.xp, 0)

  return (
    <div className="px-4 pt-2.5 pb-1">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          Today's Challenges
        </span>
        <span className={cn(
          "text-[10px] font-mono font-bold tabular-nums",
          allDone ? "text-success" : "text-muted-foreground/60"
        )}>
          {allDone ? `+${maxXp} XP ✓` : `${totalXp}/${maxXp} XP`}
        </span>
      </div>

      {/* Horizontal strip of challenge chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
        {challenges.map((c) => (
          <ChallengeChip key={c.id} challenge={c} />
        ))}
      </div>
    </div>
  )
}

function ChallengeChip({ challenge: c }: { challenge: DailyChallenge }) {
  const pct = c.target > 0 ? Math.min((c.progress / c.target) * 100, 100) : 0
  const inProgress = c.progress > 0 && !c.completed

  return (
    <div
      className={cn(
        "relative shrink-0 w-[130px] px-2.5 py-2 flex flex-col gap-1.5",
        "border transition-colors duration-200",
        c.completed
          ? "bg-success/8 border-success/20"
          : "bg-card border-border"
      )}
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Top row: emoji + XP pill */}
      <div className="flex items-center justify-between">
        {c.completed
          ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-hidden="true" />
          : <span className="text-sm leading-none" aria-hidden>{c.emoji}</span>
        }
        <span
          className={cn(
            "text-[9px] font-bold font-mono px-1 py-0.5 uppercase tracking-wider",
            c.completed
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground"
          )}
          style={{ borderRadius: "var(--radius-badge)" }}
        >
          +{c.xp} XP
        </span>
      </div>

      {/* Label */}
      <span className={cn(
        "text-[11px] font-semibold leading-tight",
        c.completed ? "text-success" : "text-foreground"
      )}>
        {c.label}
      </span>

      {/* Progress bar — only when in progress or completed */}
      {(inProgress || c.completed) && (
        <div
          className="h-0.5 bg-muted overflow-hidden"
          style={{ borderRadius: "9999px" }}
        >
          <div
            className={cn(
              "h-full transition-all duration-500",
              c.completed ? "bg-success" : "bg-accent"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Subtle dot grid for "not started" state */}
      {!inProgress && !c.completed && (
        <p className="text-[9px] text-muted-foreground/50 leading-none">
          {c.description}
        </p>
      )}
    </div>
  )
}
