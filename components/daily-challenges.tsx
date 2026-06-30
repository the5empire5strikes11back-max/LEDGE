"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, Target, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DailyChallenge } from "@/app/api/challenges/route"

interface DailyChallengesProps {
  /** Called after a challenge is shown (for logging / animations) */
  onLoaded?: (challenges: DailyChallenge[]) => void
}

export function DailyChallenges({ onLoaded }: DailyChallengesProps) {
  const [challenges, setChallenges] = useState<DailyChallenge[]>([])
  const [loading, setLoading] = useState(true)
  // Collapsed by default — the feed should land you on market cards, not a
  // dashboard. The pill stays as a one-line entry point you can expand.
  const [expanded, setExpanded] = useState(false)

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
      <div className="px-4 pt-3 pb-1.5">
        <div className="skeleton h-[42px] w-full" style={{ borderRadius: "var(--radius-card)" }} />
      </div>
    )
  }

  if (challenges.length === 0) return null

  const allDone   = challenges.every((c) => c.completed)
  const doneCount = challenges.filter((c) => c.completed).length
  const maxXp     = challenges.reduce((s, c) => s + c.xp, 0)

  return (
    <div className="px-4 pt-3 pb-1.5">
      {/* Collapsed pill — one slim line, tap to reveal the challenge chips */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cn(
          "w-full flex items-center gap-2.5 px-3.5 py-2.5 border transition-colors",
          allDone
            ? "bg-success/8 border-success/20"
            : "bg-card border-border hover:border-border/70"
        )}
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <Target className={cn("w-3.5 h-3.5 shrink-0", allDone ? "text-success" : "text-accent")} aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          Today's Challenges
        </span>
        <span className={cn(
          "ml-auto text-[10px] font-mono font-bold tabular-nums",
          allDone ? "text-success" : "text-muted-foreground/70"
        )}>
          {allDone ? `+${maxXp} XP ✓` : `${doneCount}/${challenges.length}`}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
            expanded && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {/* Expanded: horizontal strip of challenge chips */}
      {expanded && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {challenges.map((c) => (
            <ChallengeChip key={c.id} challenge={c} />
          ))}
        </div>
      )}
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
