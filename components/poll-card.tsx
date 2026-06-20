"use client"

import { useState, useEffect, useCallback } from "react"
import { BarChart3, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Countdown } from "@/components/ui/countdown"

interface PollOption { id: string; label: string; votes: number; pct: number }

interface PollCardProps {
  groupId: string
  groupLabel: string
  category: string
  endTime: Date
  className?: string
  style?: React.CSSProperties
}

export function PollCard({ groupId, groupLabel, category, endTime, className, style }: PollCardProps) {
  const [options, setOptions] = useState<PollOption[]>([])
  const [total, setTotal] = useState(0)
  const [userVote, setUserVote] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)
  const closed = endTime.getTime() <= Date.now()

  const load = useCallback(async () => {
    const r = await fetch(`/api/polls/${groupId}`)
    if (r.ok) { const d = await r.json(); setOptions(d.options ?? []); setTotal(d.totalVotes ?? 0); setUserVote(d.userVote ?? null) }
  }, [groupId])
  useEffect(() => { load() }, [load])

  const vote = useCallback(async (optionId: string) => {
    if (voting || closed) return
    setVoting(true)
    try {
      const r = await fetch(`/api/polls/${groupId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ option_market_id: optionId }) })
      if (r.ok) { const d = await r.json(); setOptions(d.options ?? []); setTotal(d.totalVotes ?? 0); setUserVote(d.userVote ?? null) }
    } finally { setVoting(false) }
  }, [groupId, voting, closed])

  const showResults = userVote != null || closed

  return (
    <div className={cn("card-base p-4 flex flex-col gap-3", className)} style={style}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{category}</span>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-accent/10 text-accent/80" style={{ borderRadius: "var(--radius-badge)" }}>
            <BarChart3 className="w-2.5 h-2.5" /> Poll
          </span>
        </div>
        {!closed && <Countdown endTime={endTime} />}
      </div>

      <h3 className="text-[15px] font-semibold text-foreground leading-snug text-balance">{groupLabel}</h3>

      <div className="flex flex-col gap-1.5">
        {options.map((o) => {
          const mine = userVote === o.id
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              disabled={closed || voting}
              className={cn(
                "relative overflow-hidden flex items-center justify-between gap-2 px-3 py-2.5 border text-left transition-all duration-[80ms] active:scale-[0.99] disabled:active:scale-100",
                mine ? "border-accent/50 bg-accent/5" : "border-border bg-surface hover:border-accent/40"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              {showResults && (
                <div className={cn("absolute inset-y-0 left-0 transition-all duration-500", mine ? "bg-accent/15" : "bg-muted/40")} style={{ width: `${o.pct}%` }} />
              )}
              <span className="relative z-10 text-xs font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                {mine && <Check className="w-3 h-3 text-accent shrink-0" />}
                <span className="truncate">{o.label}</span>
              </span>
              {showResults && (
                <span className="relative z-10 font-mono text-sm font-black text-foreground tabular-nums shrink-0">{o.pct}%</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className="text-[10px] text-muted-foreground/60">{total} vote{total !== 1 ? "s" : ""}</span>
        <span className="text-[10px] text-muted-foreground/50">{closed ? "Closed" : userVote ? "Tap to change" : "Tap to vote"}</span>
      </div>
    </div>
  )
}
