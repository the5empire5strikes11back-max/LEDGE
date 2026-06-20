"use client"

import { ShieldCheck, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { Countdown } from "@/components/ui/countdown"
import { getResolutionMeta } from "@/lib/resolution-label"
import { payoutMultiplier } from "@/lib/game-engine"
import type { GroupType } from "@/lib/market-groups"

export interface GroupOption {
  id: string                 // the option's own market id
  optionLabel: string
  yesPercent: number         // this option's CHANCE of being the outcome
  userBet?: { side: "yes" | "no"; amount: number } | null
  resolvedWinner?: "yes" | "no" | null
}

interface MarketGroupCardProps {
  groupLabel: string
  category: string
  endTime: Date
  groupType: GroupType
  exclusive: boolean
  options: GroupOption[]
  resolutionSourceUrl?: string | null
  targetDataKey?: string | null
  className?: string
  style?: React.CSSProperties
  /** Bet YES on a given option (each option is its own binary market). */
  onBetOption: (optionMarketId: string) => void
  /** Open the option's full detail. */
  onOpenOption?: (optionMarketId: string) => void
}

const TYPE_LABEL: Record<GroupType, string> = {
  yes_no: "Yes / No",
  multiple_choice: "Multiple Choice",
  numeric: "Numeric",
  date: "Date",
  set: "Set",
}

export function MarketGroupCard({
  groupLabel, category, endTime, groupType, exclusive, options,
  resolutionSourceUrl, targetDataKey, className, style, onBetOption, onOpenOption,
}: MarketGroupCardProps) {
  const resMeta = getResolutionMeta(resolutionSourceUrl, targetDataKey)
  const isResolved = options.some((o) => o.resolvedWinner != null)
  // Favorite first; show the top options, collapse the rest behind a count.
  const sorted = [...options].sort((a, b) => b.yesPercent - a.yesPercent)
  const shown = sorted.slice(0, 5)
  const hiddenCount = sorted.length - shown.length

  return (
    <div
      className={cn("card-base p-4 flex flex-col gap-3", className)}
      style={style}
    >
      {/* Row 1: category + type + time */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{category}</span>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-accent/10 text-accent/80 shrink-0" style={{ borderRadius: "var(--radius-badge)" }}>
            <Layers className="w-2.5 h-2.5" />
            {TYPE_LABEL[groupType]}
          </span>
        </div>
        {!isResolved && <Countdown endTime={endTime} />}
      </div>

      {/* Question */}
      <button onClick={() => onOpenOption?.(shown[0]?.id)} className="text-left">
        <h3 className="text-[15px] font-semibold text-foreground leading-snug text-balance">{groupLabel}</h3>
      </button>

      {/* Options — each tappable to bet YES on it */}
      <div className="flex flex-col gap-1.5">
        {shown.map((opt) => {
          const won = opt.resolvedWinner === "yes"
          const lost = opt.resolvedWinner === "no"
          return (
            <button
              key={opt.id}
              onClick={() => (isResolved || opt.userBet ? onOpenOption?.(opt.id) : onBetOption(opt.id))}
              className={cn(
                "group/opt flex items-center gap-3 px-3 py-2.5 border text-left transition-all duration-[80ms] ease-[var(--ease-sharp)] active:scale-[0.99]",
                won ? "bg-success/10 border-success/30"
                : lost ? "bg-surface border-border opacity-60"
                : opt.userBet ? "bg-accent/5 border-accent/30"
                : "bg-surface border-border hover:border-accent/40"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              {/* Probability bar background */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground truncate">{opt.optionLabel}</span>
                  <span className="font-mono text-sm font-black text-foreground tabular-nums shrink-0">
                    {Math.round(opt.yesPercent)}%
                  </span>
                </div>
                <div className="h-1 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
                  <div
                    className={cn("h-full transition-all duration-500", won ? "bg-success" : "bg-accent/70")}
                    style={{ width: `${Math.max(2, Math.min(100, opt.yesPercent))}%` }}
                  />
                </div>
              </div>
              {/* Buy hint */}
              {!isResolved && !opt.userBet && (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-success/70 opacity-0 group-hover/opt:opacity-100 transition-opacity">
                  {payoutMultiplier(opt.yesPercent)}
                </span>
              )}
              {opt.userBet && !isResolved && (
                <span className="shrink-0 text-[9px] font-bold uppercase text-accent">yours</span>
              )}
              {won && <span className="shrink-0 text-[9px] font-bold uppercase text-success">won</span>}
            </button>
          )
        })}
        {hiddenCount > 0 && (
          <button
            onClick={() => onOpenOption?.(sorted[0]?.id)}
            className="text-[10px] text-muted-foreground hover:text-foreground text-center py-1 transition-colors"
          >
            +{hiddenCount} more option{hiddenCount > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Footer: resolution + exclusivity hint */}
      <div className="flex items-center gap-3 pt-2 border-t border-border/50">
        {resMeta.label && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 shrink-0">
            <ShieldCheck className={cn("w-3 h-3 shrink-0", resMeta.isAuto ? "text-success/70" : "text-muted-foreground/40")} aria-hidden />
            {resMeta.label}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/50 ml-auto">
          {exclusive ? "Pick one" : "Pick any"}
        </span>
      </div>
    </div>
  )
}
