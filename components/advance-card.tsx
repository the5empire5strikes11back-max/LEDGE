"use client"

import { useState, useEffect, useCallback } from "react"
import { Landmark } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface AdvanceState {
  claimable: number
  outstanding: number
  liveValue: number
  alreadyClaimedToday: boolean
}

function fmt(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/**
 * Daily Advance card — pull a slice of value locked in open positions back out
 * once a day. The advance is a loan, repaid automatically from winnings/cash-outs.
 */
export function AdvanceCard({ onCreditsChange }: { onCreditsChange?: (credits: number) => void }) {
  const [state, setState] = useState<AdvanceState | null>(null)
  const [claiming, setClaiming] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/advance")
      if (r.ok) setState(await r.json())
    } catch { /* non-critical */ }
  }, [])
  useEffect(() => { load() }, [load])

  const claim = useCallback(async () => {
    if (claiming) return
    setClaiming(true)
    try {
      const r = await fetch("/api/advance", { method: "POST" })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast.error("Couldn't claim advance", { description: data?.error ?? "Try again.", duration: 3000 })
        return
      }
      if (typeof data?.credits === "number") onCreditsChange?.(data.credits)
      toast(`🏦 Advance claimed · +${fmt(data?.claimed ?? 0)} CR`, {
        description: "Repaid automatically from your winnings.",
        duration: 4000,
      })
      await load()
    } finally {
      setClaiming(false)
    }
  }, [claiming, onCreditsChange, load])

  // Hide entirely when there's nothing to claim and no debt to surface.
  if (!state || (state.claimable < 1 && state.outstanding < 1 && state.alreadyClaimedToday === false)) return null

  const canClaim = state.claimable >= 1 && !state.alreadyClaimedToday

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 bg-surface border border-border"
      style={{ borderRadius: "var(--radius-button)" }}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
          <Landmark className="w-3.5 h-3.5 text-accent" /> Daily Advance
        </p>
        {state.outstanding > 0 && (
          <p className="text-[10px] text-muted-foreground/70 font-mono">
            Owed {fmt(state.outstanding)} CR — repaid from winnings
          </p>
        )}
        {state.outstanding < 1 && (
          <p className="text-[10px] text-muted-foreground/70">
            Borrow against your open positions
          </p>
        )}
      </div>

      <button
        onClick={claim}
        disabled={!canClaim || claiming}
        className={cn(
          "shrink-0 px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.97]",
          canClaim ? "bg-accent text-accent-foreground hover:bg-accent/90" : "bg-muted text-muted-foreground cursor-not-allowed"
        )}
        style={{ borderRadius: "var(--radius-button)" }}
      >
        {claiming
          ? "Claiming…"
          : state.alreadyClaimedToday
          ? "Back tomorrow"
          : canClaim
          ? `Claim +${fmt(state.claimable)} CR`
          : "Nothing yet"}
      </button>
    </div>
  )
}
