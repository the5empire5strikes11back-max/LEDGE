"use client"

import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface CoachmarkProps {
  show: boolean
  icon: LucideIcon
  iconColor?: string
  title: string
  body: string
  /** Vertical anchor — where to place the card in the viewport */
  position?: "top" | "center" | "bottom"
  /** Which direction the arrow points from the card toward the target */
  arrowDir?: "up" | "down"
  cta?: string
  onDismiss: () => void
}

export function Coachmark({
  show,
  icon: Icon,
  iconColor = "text-accent",
  title,
  body,
  position = "center",
  arrowDir = "down",
  cta = "Got it",
  onDismiss,
}: CoachmarkProps) {
  if (!show) return null

  const verticalClass = {
    top: "items-start pt-24",
    center: "items-center",
    bottom: "items-end pb-32",
  }[position]

  return (
    <div
      className={cn(
        "fixed inset-0 z-[450] flex justify-center px-5 bg-black/75 animate-in fade-in duration-200"
      , verticalClass)}
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-sm animate-in zoom-in-95 fade-in duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow pointing toward the UI element */}
        {arrowDir === "up" && (
          <div className="flex justify-center mb-0">
            <div
              className="w-0 h-0"
              style={{
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderBottom: "10px solid var(--surface, hsl(var(--card)))",
              }}
            />
          </div>
        )}

        <div
          className="bg-card border border-border px-5 py-5 flex flex-col gap-3"
          style={{ borderRadius: "var(--radius-card)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
              <Icon className={cn("w-4.5 h-4.5", iconColor)} />
            </div>
            <span className="text-sm font-bold text-foreground">{title}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
          <button
            onClick={onDismiss}
            className="self-end text-xs font-semibold text-accent hover:opacity-80 transition-opacity px-3 py-1.5 bg-accent/10 rounded-full"
          >
            {cta}
          </button>
        </div>

        {arrowDir === "down" && (
          <div className="flex justify-center mt-0">
            <div
              className="w-0 h-0"
              style={{
                borderLeft: "10px solid transparent",
                borderRight: "10px solid transparent",
                borderTop: "10px solid var(--surface, hsl(var(--card)))",
              }}
            />
          </div>
        )}
      </div>

      {/* Tap-anywhere hint */}
      <p className="absolute bottom-8 left-0 right-0 text-center text-[11px] text-foreground/40">
        Tap anywhere to close
      </p>
    </div>
  )
}
