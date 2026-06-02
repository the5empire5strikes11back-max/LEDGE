"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProgressiveTipProps {
  show: boolean
  icon: string
  title: string
  body: string
  onDismiss: () => void
}

export function ProgressiveTip({ show, icon, title, body, onDismiss }: ProgressiveTipProps) {
  if (!show) return null

  return (
    <div
      className={cn(
        "fixed z-[300] w-[268px]",
        // Bottom-right, above mobile nav
        "bottom-[88px] lg:bottom-10 right-4",
        "bg-surface border border-accent/35 px-4 py-3.5 shadow-xl",
        "animate-in fade-in slide-in-from-right-4 duration-400"
      )}
      style={{
        borderRadius: "var(--radius-card)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(245,166,35,0.12)",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm" aria-hidden>{icon}</span>
          <span className="text-[10px] text-accent uppercase tracking-widest font-bold">{title}</span>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  )
}
