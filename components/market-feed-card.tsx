"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Countdown } from "@/components/ui/countdown"
import { OddsSparkline } from "@/components/ui/odds-sparkline"
import { computeMovementSignals, type OddsPoint } from "@/lib/odds-history"

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
  oddsHistory?: OddsPoint[]
  /** Increments each time history is updated — invalidates memoized signals */
  oddsVersion?: number
  userBet?: { side: "yes" | "no"; amount: number }
  resolved?: { winner: "yes" | "no" }
  className?: string
  onClick?: () => void
  onBuyYes?: () => void
  onBuyNo?: () => void
}

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

  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {Math.round(displayValue)}
    </span>
  )
}

// ── Volatility glow class ─────────────────────────────────────────────────────

function volatilityGlowClass(
  volatility: "calm" | "moving" | "volatile" | "surging",
  trend: "up" | "down" | "flat"
): string {
  if (volatility === "calm" || volatility === "moving") return ""
  const dir = trend === "up" ? "yes" : trend === "down" ? "no" : "neutral"
  return `market-${volatility}-${dir}`
}

// ── Live dot ─────────────────────────────────────────────────────────────────

function LiveDot({ volatility }: { volatility: "calm" | "moving" | "volatile" | "surging" }) {
  if (volatility === "calm") return null
  const dotClass =
    volatility === "surging" ? "live-dot-surging bg-accent" :
    volatility === "volatile" ? "live-dot-volatile bg-accent" :
    "live-dot-moving bg-accent/60"

  return (
    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass)} />
  )
}

// ── Movement label ────────────────────────────────────────────────────────────

function MovementLabel({
  label,
  trend,
  volatility,
}: {
  label: string | null
  trend: "up" | "down" | "flat"
  volatility: "calm" | "moving" | "volatile" | "surging"
}) {
  if (!label || volatility === "calm") return null

  const textColor =
    trend === "up"   ? "text-success/80" :
    trend === "down" ? "text-danger/80"  : "text-accent/80"

  return (
    <span className={cn("text-[10px] font-medium font-mono shrink-0 truncate", textColor)}>
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

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
  oddsHistory = [],
  oddsVersion = 0,
  userBet,
  resolved,
  className,
  onClick,
  onBuyYes,
  onBuyNo,
}: MarketFeedCardProps) {
  const isHot = hotScore >= 8
  const noPercent = 100 - yesPercent
  const hasUserBet = !!userBet
  const isResolved = !!resolved
  const totalPool = yesPool + noPool

  const isWin  = isResolved && userBet && resolved.winner === userBet.side
  const isLoss = isResolved && userBet && resolved.winner !== userBet.side

  // Compute movement signals — memoized, invalidated by oddsVersion counter
  // (oddsHistory is a mutable ref array; its reference never changes)
  const signals = useMemo(
    () => computeMovementSignals(oddsHistory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oddsVersion, yesPercent] // oddsVersion bumps whenever new points are pushed
  )

  const { trend, volatility, label: movementLabel } = signals
  const glowClass = !isResolved ? volatilityGlowClass(volatility, trend) : ""

  // Show movement row only when we have real history to show
  const hasMovement = oddsHistory.length >= 2 && (movementLabel !== null || volatility !== "calm")

  return (
    <div
      className={cn(
        "relative bg-card border overflow-hidden transition-colors duration-200",
        // Featured: subtle left accent
        isFeatured && !isResolved && "border-border border-l-2 border-l-accent",
        // Default / hot
        !isFeatured && !isResolved && "border-border",
        // Resolved positions
        isWin  && "border-l-2 border-l-success",
        isLoss && "border-l-2 border-l-danger opacity-75",
        // Open position (not resolved)
        hasUserBet && !isResolved && !isWin && !isLoss && "border-l-2 border-l-accent",
        // Volatility glow (overrides default border-color on the shadow only)
        glowClass,
        className
      )}
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <div className="p-4 flex flex-col gap-3">

        {/* Row 1: Category · live signals · time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">
              {categoryLabel[category]}
            </span>

            {/* Live dot — only shown when there's actual movement */}
            {!isResolved && <LiveDot volatility={volatility} />}

            {/* HOT label */}
            {isHot && !isResolved && volatility === "calm" && (
              <span className="text-[10px] text-orange-400 font-medium shrink-0">Hot</span>
            )}

            {/* Momentum number — only when no history-based label is available */}
            {!isResolved && momentumShift >= 3 && !hasMovement && volatility === "calm" && (
              <span className="text-[10px] text-accent font-mono shrink-0">
                ↑{momentumShift.toFixed(1)}%
              </span>
            )}
          </div>

          {isResolved ? (
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 shrink-0",
                resolved.winner === "yes" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
              )}
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              {resolved.winner === "yes" ? "YES Won" : "NO Won"}
            </span>
          ) : (
            <Countdown endTime={endTime} />
          )}
        </div>

        {/* Row 2: [Price column] [Title] */}
        <button onClick={onClick} className="flex items-start gap-4 text-left w-full group">

          {/* Price column: big % + sparkline stacked */}
          <div className="shrink-0 flex flex-col items-center w-[56px] gap-0.5">
            <AnimatedNumber
              value={yesPercent}
              className={cn(
                "font-black leading-none",
                yesPercent >= 100 || yesPercent <= 0 ? "text-3xl" : "text-4xl",
                yesPercent > 50 ? "text-success" :
                yesPercent < 50 ? "text-danger"  : "text-foreground"
              )}
            />
            <span className={cn(
              "text-[9px] font-semibold uppercase tracking-widest",
              yesPercent > 50 ? "text-success/50" :
              yesPercent < 50 ? "text-danger/50"  : "text-muted-foreground"
            )}>
              % YES
            </span>

            {/* Sparkline — lives directly below the percentage */}
            {!isResolved && (
              <OddsSparkline
                points={oddsHistory}
                trend={trend}
                width={56}
                height={14}
              />
            )}
          </div>

          {/* Question */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-[14px] font-semibold text-foreground leading-snug group-hover:text-accent transition-colors line-clamp-3">
              {title}
            </h3>
          </div>
        </button>

        {/* Row 3: YES/NO odds bar */}
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

        {/* Row 3b: Movement label — only when there's real activity to show */}
        {!isResolved && hasMovement && (
          <div className="flex items-center gap-2 -mt-1">
            <MovementLabel label={movementLabel} trend={trend} volatility={volatility} />
          </div>
        )}

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

        {/* Near-miss */}
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
