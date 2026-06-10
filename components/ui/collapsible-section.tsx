"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
  label: string
  /** Small text or node shown right of the label (e.g. "62% wr", "#14") */
  badge?: React.ReactNode
  defaultOpen?: boolean
  /**
   * localStorage key — state persists across sessions.
   * Omit to disable persistence.
   */
  storageKey?: string
  /**
   * Remove default px-4 py-4 padding from the content area.
   * Use when children have their own edge-to-edge layout (rows, dividers, etc.)
   */
  noPadding?: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Accordion section with a labeled tap-to-toggle header, animated open/close,
 * and optional localStorage persistence. Uses the CSS grid-template-rows trick
 * for smooth height: 0 → auto animation without a fixed max-height cap.
 */
export function CollapsibleSection({
  label,
  badge,
  defaultOpen = true,
  storageKey,
  noPadding = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(`cs_${storageKey}`)
      if (saved !== null) return saved === "1"
    }
    return defaultOpen
  })

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (storageKey && typeof window !== "undefined") {
      localStorage.setItem(`cs_${storageKey}`, next ? "1" : "0")
    }
  }

  return (
    <div
      className={cn("bg-card border border-border overflow-hidden", className)}
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Header — always visible */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 active:bg-muted/30 transition-colors duration-[80ms]"
      >
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {badge && (
            <span className="text-xs font-mono text-muted-foreground/60">
              {badge}
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Content — grid-rows trick gives smooth height: 0 → auto */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className={cn("border-t border-border/50", !noPadding && "px-4 py-4")}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
