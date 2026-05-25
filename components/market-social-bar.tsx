"use client"

import { cn } from "@/lib/utils"
import { computeFeedSignals, type MarketSocialData, type FeedSignal } from "@/lib/social-signals"

interface MarketSocialBarProps {
  social: MarketSocialData | null
  yesPercent: number
  momentumShift: number
  /** If true, renders nothing (resolved markets don't need social activity) */
  resolved?: boolean
  className?: string
}

const toneStyles: Record<FeedSignal['tone'], string> = {
  neutral: 'text-muted-foreground/70',
  yes:     'text-success/75',
  no:      'text-danger/75',
  whale:   'text-accent/90',
  alert:   'text-amber-400/80',
}

const toneDotStyles: Record<FeedSignal['tone'], string> = {
  neutral: 'bg-muted-foreground/40',
  yes:     'bg-success/60',
  no:      'bg-danger/60',
  whale:   'bg-accent/80',
  alert:   'bg-amber-400/70',
}

export function MarketSocialBar({
  social,
  yesPercent,
  momentumShift,
  resolved,
  className,
}: MarketSocialBarProps) {
  if (resolved) return null

  const signals = computeFeedSignals(social ?? undefined, yesPercent, momentumShift)
  if (signals.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {signals.map((signal, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className={cn("w-1 h-1 rounded-full shrink-0", toneDotStyles[signal.tone])} />
          <span className={cn("text-[10px] font-medium leading-none", toneStyles[signal.tone])}>
            {signal.text}
          </span>
        </div>
      ))}
    </div>
  )
}
