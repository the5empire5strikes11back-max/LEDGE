"use client"

import { useState, useRef, useEffect } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Countdown } from "@/components/ui/countdown"

type MarketCategory = "Sports" | "Politics" | "Culture" | "Circle"

interface MarketFeedCardProps {
  id: string
  title: string
  category: MarketCategory
  endTime: Date
  yesPercent: number
  yesPool: number
  noPool: number
  totalCredits: number
  hotScore?: number
  momentumShift?: number
  isFeatured?: boolean
  isNearMiss?: boolean
  userBet?: {
    side: "yes" | "no"
    amount: number
  }
  resolved?: {
    winner: "yes" | "no"
  }
  className?: string
  onClick?: () => void
  onBuyYes?: () => void
  onBuyNo?: () => void
}

// Muted category labels — information, not decoration
const categoryLabel: Record<MarketCategory, string> = {
  Sports: "Sports",
  Politics: "Politics",
  Culture: "Culture",
  Circle: "Circle",
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [displayValue, setDisplayValue] = useState(value)
  const prevValue = useRef(value)

  useEffect(() => {
    if (value === prevValue.current) return
    const start = prevValue.current
    const end = value
    const duration = 500
    const startTime = performance.now()

    const animate = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(start + (end - start) * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
    prevValue.current = value
  }, [value])

  const rounded = Math.round(displayValue)
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {rounded}
    </span>
  )
}

export function MarketFeedCard({
  title,
  category,
  endTime,
  yesPercent,
  yesPool,
  noPool,
  totalCredits,
  hotScore = 0,
  momentumShift = 0,
  isFeatured = false,
  isNearMiss = false,
  userBet,
  resolved,
  className,
  onClick,
  onBuyYes,
  onBuyNo,
}: MarketFeedCardProps) {
  const isHot = hotScore >= 8
  const hasMomentum = momentumShift >= 3
  const noPercent = 100 - yesPercent
  const hasUserBet = !!userBet
  const isResolved = !!resolved
  const totalPool = yesPool + noPool

  const isWin = isResolved && userBet && resolved.winner === userBet.side
  const isLoss = isResolved && userBet && resolved.winner !== userBet.side

  return (
    <div
      className={cn(
        "relative bg-card border overflow-hidden transition-colors duration-200",
        // Featured: subtle left accent line, no glow
        isFeatured && !isResolved && "border-border border-l-2 border-l-accent",
        // Hot: slightly brighter border only
        isHot && !isFeatured && !isResolved && "border-border/70",
        // Default
        !isFeatured && !isHot && !isResolved && "border-border",
        // Position results
        isWin && "border-l-2 border-l-success",
        isLoss && "border-l-2 border-l-danger opacity-75",
        // Open position
        hasUserBet && !isResolved && !isWin && !isLoss && "border-l-2 border-l-accent",
        className
      )}
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <div className="p-4 flex flex-col gap-3">

        {/* Row 1: Category · signals · time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Category — plain text, no colored pill */}
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">
              {categoryLabel[category]}
            </span>

            {/* HOT: a small static dot — signal, not decoration */}
            {isHot && !isResolved && (
              <span className="flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                <span className="text-[10px] text-orange-400 font-medium">Hot</span>
              </span>
            )}

            {/* Momentum: plain data, no badge */}
            {hasMomentum && !isHot && !isResolved && (
              <span className="text-[10px] text-accent font-mono shrink-0">
                ↑{momentumShift.toFixed(1)}%
              </span>
            )}
          </div>

          {isResolved ? (
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 shrink-0",
                resolved.winner === "yes"
                  ? "bg-success/15 text-success"
                  : "bg-danger/15 text-danger"
              )}
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              {resolved.winner === "yes" ? "YES Won" : "NO Won"}
            </span>
          ) : (
            <Countdown endTime={endTime} />
          )}
        </div>

        {/* Row 2: Question + probability — question is the product */}
        <button
          onClick={onClick}
          className="flex items-start gap-4 text-left w-full group"
        >
          {/* Probability — the price */}
          <div className="shrink-0 flex flex-col items-center w-[56px]">
            <AnimatedNumber
              value={yesPercent}
              className={cn(
                "font-black leading-none",
                yesPercent >= 100 || yesPercent <= 0 ? "text-3xl" : "text-4xl",
                yesPercent > 50 ? "text-success" : yesPercent < 50 ? "text-danger" : "text-foreground"
              )}
            />
            <span className={cn(
              "text-[9px] font-semibold uppercase tracking-widest mt-0.5",
              yesPercent > 50 ? "text-success/50" : yesPercent < 50 ? "text-danger/50" : "text-muted-foreground"
            )}>
              % YES
            </span>
          </div>

          {/* The question — more visual weight */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-[14px] font-semibold text-foreground leading-snug group-hover:text-accent transition-colors line-clamp-3">
              {title}
            </h3>
          </div>
        </button>

        {/* Row 3: YES/NO split bar */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-success/70 font-mono w-8 text-right shrink-0">
            {yesPercent.toFixed(0)}%
          </span>
          <div className="flex-1 relative h-1 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
            <div
              className="absolute inset-y-0 left-0 bg-success transition-all duration-500 ease-out"
              style={{ width: `${yesPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-danger/70 font-mono w-8 shrink-0">
            {noPercent.toFixed(0)}%
          </span>
        </div>

        {/* Row 4: Trade buttons */}
        {!isResolved && !hasUserBet && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onBuyYes}
              className={cn(
                "flex items-center justify-between py-2.5 px-3 border transition-all duration-150",
                "bg-success/8 border-success/20 hover:bg-success/15 hover:border-success/35 active:scale-[0.98]"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-success" />
                <span className="text-[11px] font-bold text-success uppercase tracking-wide">Yes</span>
              </div>
              <span className="font-mono text-sm font-black text-success">
                <AnimatedNumber value={yesPercent} />¢
              </span>
            </button>

            <button
              onClick={onBuyNo}
              className={cn(
                "flex items-center justify-between py-2.5 px-3 border transition-all duration-150",
                "bg-danger/8 border-danger/20 hover:bg-danger/15 hover:border-danger/35 active:scale-[0.98]"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <div className="flex items-center gap-1.5">
                <TrendingDown className="w-3 h-3 text-danger" />
                <span className="text-[11px] font-bold text-danger uppercase tracking-wide">No</span>
              </div>
              <span className="font-mono text-sm font-black text-danger">
                <AnimatedNumber value={noPercent} />¢
              </span>
            </button>
          </div>
        )}

        {/* Open position */}
        {hasUserBet && !isResolved && (
          <div
            className="flex items-center justify-between px-3 py-2 bg-surface border border-border"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Open position</span>
              <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                {userBet.side.toUpperCase()} · {formatCredits(userBet.amount)} CR
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</span>
              <p className={cn(
                "text-xs font-mono font-bold mt-0.5",
                userBet.side === "yes" ? "text-success" : "text-danger"
              )}>
                {(userBet.side === "yes" ? yesPercent : noPercent).toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {/* Resolved position */}
        {hasUserBet && isResolved && (
          <div
            className={cn(
              "flex items-center justify-between px-3 py-2 border",
              isWin ? "bg-success/8 border-success/20" : "bg-danger/8 border-danger/20"
            )}
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <span className={cn("text-xs font-bold uppercase tracking-wide", isWin ? "text-success" : "text-danger")}>
              {isWin ? "✓ Won" : "✕ Lost"}
            </span>
            <span className={cn("text-xs font-mono font-bold", isWin ? "text-success" : "text-danger")}>
              {isWin ? `+${formatCredits(userBet.amount)}` : `-${formatCredits(userBet.amount)}`} CR
            </span>
          </div>
        )}

        {/* Near-miss: factual, not manipulative */}
        {isNearMiss && isResolved && (
          <p className="text-[10px] text-muted-foreground">
            Settled at {yesPercent.toFixed(1)}% — resolved within 10% margin
          </p>
        )}

        {/* Footer: market data */}
        <div className="flex items-center gap-3 pt-1 border-t border-border/50">
          <span className="text-[10px] font-mono text-muted-foreground/70">
            {formatCredits(totalCredits)} vol
          </span>
          {totalPool > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground/70">
              {formatCredits(totalPool)} pool
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground/70">
            {hotScore} trades
          </span>
          {onClick && (
            <button
              onClick={onClick}
              className="ml-auto text-[10px] text-muted-foreground/40 hover:text-accent transition-colors"
            >
              Details →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
