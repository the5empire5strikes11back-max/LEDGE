"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface FeedTooltipProps {
  visible: boolean
  onDismiss: () => void
}

export function FeedTooltip({ visible, onDismiss }: FeedTooltipProps) {
  if (!visible) return null

  return (
    <div
      className={cn(
        "mx-4 mb-2 flex items-center justify-between gap-3 px-3 py-2.5",
        "bg-accent/10 border border-accent/30",
        "animate-in fade-in slide-in-from-top-2 duration-400"
      )}
      style={{ borderRadius: "var(--radius-button)" }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm shrink-0" aria-hidden>⚡</span>
        <p className="text-[11px] text-accent/90 font-medium leading-snug">
          Tap <span className="text-success font-bold">YES</span> or <span className="text-danger font-bold">NO</span> on any card to make your prediction — free credits, no real money.
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss tip"
        className="shrink-0 p-0.5 text-accent/50 hover:text-accent transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
