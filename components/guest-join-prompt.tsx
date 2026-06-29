"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface GuestJoinPromptProps {
  open: boolean
  onClose: () => void
}

export function GuestJoinPrompt({ open, onClose }: GuestJoinPromptProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setVisible(true)
    } else {
      const t = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!visible) return null

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/60 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[61] bg-surface-2 border-t border-border px-5 pt-5 pb-8 transition-transform duration-300",
          open ? "translate-y-0" : "translate-y-full"
        )}
        style={{ borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-4xl mb-3">🎯</div>

        <h2 className="text-xl font-black text-foreground mb-1">Join Ledge to predict</h2>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
          Predict outcomes, earn credits, and climb the leaderboard. It&apos;s free.
        </p>

        <div className="flex flex-col gap-2.5">
          <a
            href="/auth/signup"
            className="w-full py-3.5 text-sm font-black uppercase tracking-widest text-accent-foreground text-center transition-all active:scale-[0.97]"
            style={{ backgroundColor: "var(--accent)", borderRadius: "var(--radius-button)" }}
          >
            Create Free Account
          </a>
          <a
            href="/auth/login"
            className="w-full py-3 text-sm font-semibold text-muted-foreground text-center border border-border hover:border-accent/40 transition-colors"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            Already have an account? Sign in
          </a>
        </div>
      </div>
    </>
  )
}
