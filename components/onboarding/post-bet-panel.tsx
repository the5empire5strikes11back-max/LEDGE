"use client"

import { useEffect, useRef, useState } from "react"
import { X, Clock, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { calculateFixedOddsPayout } from "@/lib/game-engine"

interface PostBetPanelProps {
  show: boolean
  marketTitle: string
  endTime: Date
  userSide: "yes" | "no"
  currentOdds: number   // yes_percent at time of bet
  amount: number
  onDismiss: () => void
}

const AUTO_DISMISS_MS = 9000

function formatTimeLeft(endTime: Date): string {
  const ms = endTime.getTime() - Date.now()
  if (ms <= 0) return "soon"
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d`
  if (h > 0) return `${h}h ${m > 0 ? ` ${m}m` : ""}`
  return `${m}m`
}

function estimatePayout(side: "yes" | "no", odds: number, amount: number): number {
  return calculateFixedOddsPayout(amount, side === "yes" ? odds : 100 - odds)
}

export function PostBetPanel({
  show,
  marketTitle,
  endTime,
  userSide,
  currentOdds,
  amount,
  onDismiss,
}: PostBetPanelProps) {
  const [progress, setProgress] = useState(100)
  const startRef = useRef<number>(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!show) {
      setProgress(100)
      return
    }
    startRef.current = Date.now()

    const tick = () => {
      const elapsed = Date.now() - startRef.current
      const pct = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100)
      setProgress(pct)
      if (pct > 0) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        onDismiss()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [show, onDismiss])

  const payout = estimatePayout(userSide, currentOdds, amount)
  const profit = payout - amount
  const sideOdds = userSide === "yes" ? currentOdds : 100 - currentOdds
  const timeLeft = formatTimeLeft(endTime)

  if (!show) return null

  return (
    <div className="fixed bottom-[72px] inset-x-0 z-50 px-3 pointer-events-none lg:left-auto lg:right-6 lg:bottom-8 lg:inset-x-auto lg:w-[320px]">
      <div
        className="pointer-events-auto bg-card border border-border shadow-xl overflow-hidden animate-in slide-in-from-bottom-3 fade-in duration-300"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {/* Countdown progress bar */}
        <div className="h-0.5 bg-muted overflow-hidden">
          <div
            className="h-full bg-accent/60 transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="px-4 pt-3 pb-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                Prediction locked in
              </span>
            </div>
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Market title */}
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
            {marketTitle}
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-1.5">
            <div
              className="flex flex-col items-center py-2 px-1 bg-surface border border-border"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <span className={cn(
                "text-sm font-black",
                userSide === "yes" ? "text-success" : "text-danger"
              )}>
                {userSide.toUpperCase()}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Your call</span>
            </div>

            <div
              className="flex flex-col items-center py-2 px-1 bg-surface border border-border"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <span className="text-sm font-black font-mono text-foreground">{sideOdds}%</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Odds</span>
            </div>

            <div
              className="flex flex-col items-center py-2 px-1 bg-surface border border-border"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <span className={cn(
                "text-sm font-black font-mono",
                profit > 0 ? "text-accent" : "text-muted-foreground"
              )}>
                +{profit > 0 ? profit.toLocaleString() : "—"}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Est. win</span>
            </div>
          </div>

          {/* Resolve time + live hint */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                Resolves in{" "}
                <span className="font-mono font-semibold text-foreground">{timeLeft}</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] text-success font-medium">Odds are live</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
