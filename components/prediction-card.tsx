"use client"

import { cn } from "@/lib/utils"
import { Ticker, TickerPercent } from "@/components/ui/ticker"

interface PredictionCardProps {
  title: string
  category: string
  yesPrice: number
  noPrice: number
  volume: number
  change: number
  endDate: string
  participants: number
  className?: string
}

export function PredictionCard({
  title,
  category,
  yesPrice,
  noPrice,
  volume,
  change,
  endDate,
  participants,
  className,
}: PredictionCardProps) {
  return (
    <div
      className={cn(
        "card-glow bg-card border border-border p-4 flex flex-col gap-3 cursor-pointer",
        className
      )}
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {category}
          </span>
          <h3 className="text-sm font-medium text-foreground mt-1 line-clamp-2 text-balance">
            {title}
          </h3>
        </div>
        <TickerPercent value={change} />
      </div>

      {/* Price Grid */}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="flex flex-col items-center justify-center py-2.5 bg-success/10 hover:bg-success/20 border border-success/20 transition-colors"
          style={{ borderRadius: "var(--radius-button)" }}
        >
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Yes</span>
          <span className="text-lg font-mono font-semibold text-success tabular-nums">
            <Ticker value={yesPrice} suffix="%" />
          </span>
        </button>
        <button
          className="flex flex-col items-center justify-center py-2.5 bg-danger/10 hover:bg-danger/20 border border-danger/20 transition-colors"
          style={{ borderRadius: "var(--radius-button)" }}
        >
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">No</span>
          <span className="text-lg font-mono font-semibold text-danger tabular-nums">
            <Ticker value={noPrice} suffix="%" />
          </span>
        </button>
      </div>

      {/* Footer Data */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
        <div className="flex items-center gap-3">
          <span className="font-mono tabular-nums">
            {(volume / 1000).toFixed(1)}K vol
          </span>
          <span>•</span>
          <span>{participants.toLocaleString()} traders</span>
        </div>
        <span>{endDate}</span>
      </div>
    </div>
  )
}
