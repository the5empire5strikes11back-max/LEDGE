"use client"

import { Clock, TrendingUp, AlertTriangle, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReturnHook } from "@/app/api/return-hooks/route"

const HOOK_CONFIG: Record<
  ReturnHook["type"],
  {
    Icon: React.ElementType
    color: string
    bg: string
    border: string
    chipLabel: string
  }
> = {
  resolves_soon: {
    Icon: Clock,
    color: "text-accent",
    bg: "bg-accent/8",
    border: "border-accent/20",
    chipLabel: "Resolves soon",
  },
  winning: {
    Icon: TrendingUp,
    color: "text-success",
    bg: "bg-success/8",
    border: "border-success/20",
    chipLabel: "You're winning",
  },
  sentiment_shifted: {
    Icon: AlertTriangle,
    color: "text-danger",
    bg: "bg-danger/8",
    border: "border-danger/20",
    chipLabel: "Crowd shifted",
  },
  close_call: {
    Icon: Zap,
    color: "text-accent",
    bg: "bg-accent/8",
    border: "border-accent/20",
    chipLabel: "Too close",
  },
}

interface ReturnHooksBarProps {
  hooks: ReturnHook[]
  onHookClick?: (hook: ReturnHook) => void
}

export function ReturnHooksBar({ hooks, onHookClick }: ReturnHooksBarProps) {
  if (hooks.length === 0) return null

  return (
    <div className="border-b border-border bg-surface/60">
      <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-none">
        {/* Section label */}
        <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold shrink-0 pr-1">
          Your bets
        </span>
        <span className="w-px h-3 bg-border shrink-0" />

        {/* Hook chips */}
        {hooks.map((hook, i) => {
          const cfg = HOOK_CONFIG[hook.type]
          const Icon = cfg.Icon
          return (
            <button
              key={`${hook.marketId}-${hook.type}-${i}`}
              onClick={() => onHookClick?.(hook)}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 border shrink-0 transition-all duration-150",
                "hover:opacity-80 active:scale-[0.97]",
                cfg.bg,
                cfg.border,
                hook.urgent && "animate-pulse"
              )}
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              <Icon className={cn("w-3 h-3 shrink-0", cfg.color)} />
              <div className="text-left">
                <p className={cn("text-[10px] font-bold uppercase tracking-wider leading-none", cfg.color)}>
                  {cfg.chipLabel}
                </p>
                <p className="text-[10px] text-muted-foreground max-w-[140px] truncate leading-tight mt-0.5">
                  {hook.title}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
