"use client"

import { useState, useEffect, useCallback } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface ShopItem { key: string; name: string; emoji: string; description: string; price: number }
interface Inventory {
  double_down_tokens: number
  xp_boost_until: string | null
  streak_freezes: number
  safety_net_tokens: number
  streak: number
  pre_reset_streak: number
}

interface ShopModalProps {
  open: boolean
  onClose: () => void
  onCreditsChange?: (credits: number) => void
  onOpenBuyCredits?: () => void
}

function fmt(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : n.toLocaleString() }

function ownedLabel(key: string, inv: Inventory | null): string | null {
  if (!inv) return null
  if (key === "double_down") return inv.double_down_tokens > 0 ? `${inv.double_down_tokens} owned` : null
  if (key === "safety_net") return inv.safety_net_tokens > 0 ? `${inv.safety_net_tokens} owned` : null
  if (key === "streak_freeze") return inv.streak_freezes > 0 ? `${inv.streak_freezes} owned` : null
  if (key === "streak_repair") {
    if (inv.streak === 1 && inv.pre_reset_streak > 1) return `Restore ${inv.pre_reset_streak}-day streak`
    return null
  }
  if (key === "xp_boost") {
    if (inv.xp_boost_until && new Date(inv.xp_boost_until).getTime() > Date.now()) return "Active"
    return null
  }
  return null
}

function isDisabled(key: string, inv: Inventory | null, credits: number, price: number): boolean {
  if (credits < price) return true
  if (key === "streak_repair") return !inv || inv.streak !== 1 || inv.pre_reset_streak <= 1
  return false
}

function disabledReason(key: string, inv: Inventory | null, credits: number, price: number): string | null {
  if (credits < price) return null
  if (key === "streak_repair" && (!inv || inv.streak !== 1 || inv.pre_reset_streak <= 1)) return "Only usable right after a streak reset"
  return null
}

export function ShopModal({ open, onClose, onCreditsChange, onOpenBuyCredits }: ShopModalProps) {
  const [items, setItems] = useState<ShopItem[]>([])
  const [credits, setCredits] = useState(0)
  const [inv, setInv] = useState<Inventory | null>(null)
  const [buying, setBuying] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/shop")
      if (r.ok) { const d = await r.json(); setItems(d.items ?? []); setCredits(d.credits ?? 0); setInv(d.inventory ?? null) }
    } catch {
      // Network failure — leave shop state as-is
    }
  }, [])
  useEffect(() => { if (open) load() }, [open, load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    if (open) window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const buy = useCallback(async (key: string) => {
    if (buying) return
    setBuying(key)
    try {
      const r = await fetch("/api/shop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: key }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error("Couldn't buy", { description: d?.error ?? "Try again.", duration: 3000 }); return }
      setCredits(d.credits); setInv(d.inventory); onCreditsChange?.(d.credits)
      const it = items.find((i) => i.key === key)
      toast(`${it?.emoji ?? "🛒"} ${it?.name ?? "Item"} purchased`, { duration: 2500 })
    } catch {
      toast.error("Couldn't buy", { description: "Check your connection and try again.", duration: 3000 })
    } finally { setBuying(null) }
  }, [buying, items, onCreditsChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Shop"
        className="relative w-full max-w-[440px] bg-surface-2 border-t sm:border border-border animate-in slide-in-from-bottom-4 duration-300 max-h-[88vh] overflow-y-auto"
        style={{ borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0" }}
      >
        <div className="sticky top-0 bg-surface-2 z-10 flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/60">
          <div>
            <h2 className="text-base font-bold text-foreground">🛒 Shop</h2>
            <p className="text-[11px] text-muted-foreground">Spend credits on boosts</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-foreground">{fmt(credits)} <span className="text-[10px] text-muted-foreground">CR</span></span>
            <button onClick={onClose} aria-label="Close shop" className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-2.5">
          {items.map((it) => {
            const owned = ownedLabel(it.key, inv)
            const disabled = isDisabled(it.key, inv, credits, it.price)
            const tooltip = disabledReason(it.key, inv, credits, it.price)
            return (
              <div key={it.key} className="flex items-center gap-3 px-3.5 py-3 bg-surface border border-border" style={{ borderRadius: "var(--radius-card)" }}>
                <span className="text-2xl shrink-0" aria-hidden>{it.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground">{it.name}</p>
                    {owned && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-accent/15 text-accent" style={{ borderRadius: "var(--radius-badge)" }}>{owned}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{it.description}</p>
                  {tooltip && <p className="text-[10px] text-foreground/50 mt-0.5">{tooltip}</p>}
                </div>
                <button
                  onClick={() => buy(it.key)}
                  disabled={disabled || buying === it.key}
                  className={cn(
                    "shrink-0 px-3 py-2 text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.97]",
                    !disabled ? "bg-accent text-accent-foreground hover:bg-accent/90" : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  {buying === it.key ? "…" : `${fmt(it.price)} CR`}
                </button>
              </div>
            )
          })}

          {/* Out of credits CTA */}
          <div className="mt-1 flex flex-col gap-2 px-3.5 py-3 bg-accent/5 border border-accent/20" style={{ borderRadius: "var(--radius-card)" }}>
            <p className="text-[11px] text-muted-foreground">Low on credits? Earn more daily, or top up.</p>
            <button
              onClick={() => { onClose(); onOpenBuyCredits?.() }}
              className="self-start px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              Get more credits
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
