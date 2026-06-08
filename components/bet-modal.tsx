"use client"

import { useState, useEffect, useRef } from "react"
import { X, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { calculateFixedOddsPayout } from "@/lib/game-engine"
import { useOnboarding } from "@/lib/onboarding"

interface BetModalProps {
  market: {
    id: string
    title: string
    category: string
    yesPercent: number
  }
  initialSide: "yes" | "no"
  availableCredits: number
  onClose: () => void
  onSubmit: (side: "yes" | "no", amount: number) => void
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

export function BetModal({ market, initialSide, availableCredits, onClose, onSubmit }: BetModalProps) {
  const [side, setSide]       = useState<"yes" | "no">(initialSide)
  const [popping, setPopping] = useState<"yes" | "no" | null>(null)
  const [rawAmount, setRawAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function selectSide(s: "yes" | "no") {
    setSide(s)
    setPopping(s)
    setTimeout(() => setPopping(null), 250)
  }
  const inputRef = useRef<HTMLInputElement>(null)
  const { state: ob } = useOnboarding()
  const showHint = !ob.firstBetAchievementDone  // show until first bet is done

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  const amount = parseFloat(rawAmount) || 0
  const yesPercent = market.yesPercent
  const noPercent = 100 - yesPercent

  // Fixed odds — payout is locked right now at current probability
  const impliedProbPct = side === "yes" ? yesPercent : noPercent
  const lockedPayout = amount > 0 ? calculateFixedOddsPayout(amount, impliedProbPct) : 0
  const profit = lockedPayout - amount
  const multiplier = impliedProbPct > 0 ? ((100 / impliedProbPct) * 0.95).toFixed(2) : "—"

  const isValid = amount > 0 && amount <= availableCredits

  const handleSubmit = async () => {
    if (!isValid) return
    setSubmitting(true)
    onSubmit(side, amount)
  }

  const quickAmounts = [100, 500, 1_000, 5_000].filter((v) => v <= availableCredits)

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-[430px] bg-surface-2 border-t border-border animate-in slide-in-from-bottom-4 duration-[350ms]" style={{ borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0" }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        <div className="px-4 pb-6 flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-medium text-foreground leading-snug">{market.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-[0.88] transition-all duration-[80ms] ease-[var(--ease-sharp)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Side selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => selectSide("yes")}
              className={cn(
                "relative flex flex-col items-center gap-1 py-3 px-4 border",
                "transition-all duration-150 ease-[var(--ease-sharp)] active:scale-[0.97]",
                side === "yes"
                  ? "bg-success/20 border-success ring-1 ring-success/40"
                  : "bg-success/5 border-success/20 hover:bg-success/10 active:bg-success/15",
                popping === "yes" && "scale-[1.07]"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-success" />
                <span className="text-xs font-bold text-success uppercase tracking-wide">YES</span>
              </div>
              <span className="font-mono text-xl font-black text-success tabular-nums">{yesPercent.toFixed(1)}%</span>
            </button>

            <button
              onClick={() => selectSide("no")}
              className={cn(
                "relative flex flex-col items-center gap-1 py-3 px-4 border",
                "transition-all duration-150 ease-[var(--ease-sharp)] active:scale-[0.97]",
                side === "no"
                  ? "bg-danger/20 border-danger ring-1 ring-danger/40"
                  : "bg-danger/5 border-danger/20 hover:bg-danger/10 active:bg-danger/15",
                popping === "no" && "scale-[1.07]"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-danger" />
                <span className="text-xs font-bold text-danger uppercase tracking-wide">NO</span>
              </div>
              <span className="font-mono text-xl font-black text-danger tabular-nums">{noPercent.toFixed(1)}%</span>
            </button>
          </div>

          {/* Amount input */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <input
                ref={inputRef}
                type="number"
                value={rawAmount}
                onChange={(e) => setRawAmount(e.target.value)}
                placeholder="0"
                min={1}
                max={availableCredits}
                className={cn(
                  "w-full bg-muted border px-4 py-3 text-lg font-mono font-semibold tabular-nums",
                  "placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1",
                  "transition-colors",
                  side === "yes"
                    ? "border-success/30 focus:ring-success/40 focus:border-success/50"
                    : "border-danger/30 focus:ring-danger/40 focus:border-danger/50"
                )}
                style={{ borderRadius: "var(--radius-button)" }}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">CR</span>
            </div>

            {/* Quick amounts */}
            <div className="flex gap-1.5">
              {quickAmounts.map((v) => (
                <button
                  key={v}
                  onClick={() => setRawAmount(String(v))}
                  className="px-2.5 py-1 text-[11px] font-mono font-medium text-muted-foreground bg-secondary hover:text-foreground hover:bg-secondary/80 active:scale-[0.94] active:bg-muted transition-all duration-[80ms] ease-[var(--ease-sharp)]"
                  style={{ borderRadius: "var(--radius-badge)" }}
                >
                  {v >= 1_000 ? `${v / 1_000}K` : v}
                </button>
              ))}
              <button
                onClick={() => setRawAmount(String(availableCredits))}
                className="px-2.5 py-1 text-[11px] font-mono font-medium text-accent bg-accent/10 hover:bg-accent/20 active:scale-[0.94] active:bg-accent/25 transition-all duration-[80ms] ease-[var(--ease-sharp)]"
                style={{ borderRadius: "var(--radius-badge)" }}
              >
                MAX
              </button>
            </div>
          </div>

          {/* First-bet hint — shown until user places their first bet */}
          {showHint && (
            <div
              className="flex items-center gap-2 px-3 py-2 bg-accent/8 border border-accent/25 animate-in fade-in duration-300"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <span className="shrink-0 text-sm" aria-hidden>💡</span>
              <p className="text-[11px] text-accent/80 font-medium">
                Free credits only — no real money. Pick an amount and lock in your call.
              </p>
            </div>
          )}

          {/* Trade stats */}
          {amount > 0 && (
            <div
              className="flex flex-col gap-2 px-3 py-3 bg-surface border border-border"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              {/* Primary: profit if correct — what the user actually cares about */}
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">If correct</span>
                <div className="text-right">
                  <span className={cn(
                    "font-mono text-base font-bold",
                    side === "yes" ? "text-success" : "text-danger"
                  )}>
                    +{formatCredits(profit)} CR
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono ml-1.5">
                    ({formatCredits(lockedPayout)} total)
                  </span>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Multiplier</span>
                <span className="font-mono text-sm text-muted-foreground">{multiplier}×</span>
              </div>
            </div>
          )}

          {/* Balance row */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{amount > 0 ? "Balance after trade" : "Available balance"}</span>
            <span className={cn(
              "font-mono font-semibold",
              amount > 0 ? (availableCredits - amount < 0 ? "text-danger" : "text-foreground") : "text-foreground"
            )}>
              {formatCredits(availableCredits - amount)} CR
            </span>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={cn(
              "w-full py-3.5 text-sm font-bold uppercase tracking-widest",
              "transition-all duration-[80ms] ease-[var(--ease-sharp)]",
              "disabled:opacity-35 disabled:cursor-not-allowed",
              "active:scale-[0.98] active:opacity-80",
              side === "yes"
                ? "bg-success text-success-foreground hover:bg-success/90"
                : "bg-danger text-danger-foreground hover:bg-danger/90"
            )}
            style={{ borderRadius: "var(--radius-button)" }}
          >
            {submitting
              ? "Placing…"
              : amount > 0
              ? `Buy ${side.toUpperCase()} — ${formatCredits(amount)} CR`
              : `Buy ${side.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
