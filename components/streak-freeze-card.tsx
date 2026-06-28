"use client"

import { useState, useEffect, useCallback } from "react"
import { Snowflake, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface FreezeState { streak: number; freezes: number; cap: number; price: number }

/**
 * Streak Freeze inventory — Duolingo-style. Shows how many freezes you hold (each
 * auto-saves a missed day) and lets you buy more with credits.
 */
export function StreakFreezeCard({ onCreditsChange }: { onCreditsChange?: (credits: number) => void }) {
  const [state, setState] = useState<FreezeState | null>(null)
  const [buying, setBuying] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/streak/freeze")
      if (r.ok) setState(await r.json())
    } catch { /* non-critical */ }
  }, [])
  useEffect(() => { load() }, [load])

  const buy = useCallback(async () => {
    if (buying) return
    setBuying(true)
    try {
      const r = await fetch("/api/streak/freeze", { method: "POST" })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast.error("Couldn't buy freeze", { description: data?.error ?? "Try again.", duration: 3000 })
        return
      }
      if (typeof data?.credits === "number") onCreditsChange?.(data.credits)
      setState((s) => s ? { ...s, freezes: data.freezes } : s)
      toast(`🧊 Streak Freeze added`, { description: `You now hold ${data.freezes}.`, duration: 3000 })
    } finally {
      setBuying(false)
    }
  }, [buying, onCreditsChange])

  if (!state) return null
  const atCap = state.freezes >= state.cap

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 bg-surface border border-border"
      style={{ borderRadius: "var(--radius-button)" }}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          <Snowflake className="w-3.5 h-3.5 text-sky-400" /> Streak Freezes
        </p>
        <div className="flex items-center gap-1">
          {Array.from({ length: state.cap }).map((_, i) => (
            <Snowflake
              key={i}
              className={cn("w-4 h-4", i < state.freezes ? "text-sky-400" : "text-muted-foreground/25")}
            />
          ))}
          <span className="text-[10px] text-muted-foreground/70 ml-1.5">{state.freezes}/{state.cap}</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Each one saves a missed day automatically</p>
      </div>
      <button
        onClick={buy}
        disabled={atCap || buying}
        className={cn(
          "shrink-0 flex items-center gap-1 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.97]",
          atCap ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25"
        )}
        style={{ borderRadius: "var(--radius-button)" }}
      >
        {atCap ? "Full" : buying ? "Buying…" : <><Plus className="w-3 h-3" /> {state.price.toLocaleString()} CR</>}
      </button>
    </div>
  )
}
