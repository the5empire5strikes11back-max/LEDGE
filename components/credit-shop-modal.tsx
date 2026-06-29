"use client"

import { useState, useId } from "react"
import { X, Zap, Minus, Plus, Tag, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { CREDIT_PACKS, PLUS_YEARLY_PRICE } from "@/lib/stripe"
import type { CreditPackId } from "@/lib/stripe"

interface CreditShopModalProps {
  open: boolean
  onClose: () => void
  isPlus: boolean
}

function formatCredits(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

// $0.001 per CR — 1,000 CR = $1.00 (preset packs are better value)
const CUSTOM_RATE = 0.001
const CUSTOM_MIN  = 500
const CUSTOM_MAX  = 50_000
const CUSTOM_STEP = 500

function calcCustomPrice(credits: number) {
  return Math.max(0.5, credits * CUSTOM_RATE)
}

type PromoStatus = 'idle' | 'loading' | 'success' | 'error'

export function CreditShopModal({ open, onClose, isPlus }: CreditShopModalProps) {
  const [loading, setLoading]           = useState<CreditPackId | 'plus' | 'custom' | null>(null)
  const [customCredits, setCustomCredits] = useState<number>(1_000)
  const [promoCode, setPromoCode]       = useState("")
  const [promoStatus, setPromoStatus]   = useState<PromoStatus>('idle')
  const [promoMessage, setPromoMessage] = useState("")
  const inputId = useId()

  if (!open) return null

  const customPrice = calcCustomPrice(customCredits)

  function handleCustomInput(raw: string) {
    const n = parseInt(raw.replace(/\D/g, ''), 10)
    if (isNaN(n)) { setCustomCredits(CUSTOM_MIN); return }
    setCustomCredits(Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, n)))
  }

  function nudge(delta: number) {
    setCustomCredits((prev) =>
      Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, prev + delta))
    )
  }

  const handleBuyCredits = async (packId: CreditPackId) => {
    setLoading(packId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'credits', packId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(null)
    }
  }

  const handleBuyCustom = async () => {
    setLoading('custom')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'credits-custom', customCredits }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(null)
    }
  }

  const handleRedeemPromo = async () => {
    if (!promoCode.trim() || promoStatus === 'loading') return
    setPromoStatus('loading')
    try {
      const res = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setPromoStatus('success')
        setPromoMessage(`+${data.creditsAwarded.toLocaleString()} CR added to your account!`)
        setPromoCode("")
      } else {
        setPromoStatus('error')
        setPromoMessage(data.error ?? 'Something went wrong.')
      }
    } catch {
      setPromoStatus('error')
      setPromoMessage('Network error. Try again.')
    }
  }

  const handleUpgradePlus = async () => {
    setLoading('plus')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'plus' }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet — slides up from bottom on mobile, centered on desktop */}
      <div
        className={cn(
          "fixed z-50 bg-background border border-border shadow-2xl",
          "bottom-0 left-0 right-0 rounded-t-2xl",
          "max-h-[92vh] flex flex-col",
          "lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2",
          "lg:w-[420px] lg:rounded-2xl lg:max-h-[90vh]"
        )}
      >
        {/* Handle bar (mobile) */}
        <div className="lg:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-muted rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Top Up Credits</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Credits are spent on predictions — no real money at risk.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground active:scale-[0.88] transition-all duration-[80ms]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 pb-safe">

        {/* Credit packs */}
        <div className="px-5 pb-2 grid grid-cols-3 gap-2.5">
          {CREDIT_PACKS.map((pack) => {
            const isPopular    = pack.id === 'boost'
            const isBestValue  = pack.id === 'stack'
            const isProcessing = loading === pack.id

            return (
              <button
                key={pack.id}
                onClick={() => handleBuyCredits(pack.id as CreditPackId)}
                disabled={!!loading}
                className={cn(
                  "relative flex flex-col items-center gap-1.5 px-2 py-3.5",
                  "border transition-all duration-[80ms] active:scale-[0.96]",
                  isPopular
                    ? "bg-accent/8 border-accent/30 hover:bg-accent/12"
                    : "bg-card border-border hover:border-accent/30 hover:bg-secondary",
                  "disabled:opacity-60 disabled:pointer-events-none"
                )}
                style={{ borderRadius: "var(--radius-card)" }}
              >
                {/* Badge */}
                {pack.badge && (
                  <span
                    className={cn(
                      "absolute -top-2 left-1/2 -translate-x-1/2",
                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 whitespace-nowrap",
                      isPopular
                        ? "bg-accent text-accent-foreground"
                        : "bg-success text-success-foreground bg-success/15 text-success border border-success/25"
                    )}
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    {pack.badge}
                  </span>
                )}

                {/* Credits */}
                <Zap className={cn("w-4 h-4 mt-1", isPopular ? "text-accent" : "text-muted-foreground")} />
                <span className={cn(
                  "text-base font-bold font-mono tabular-nums",
                  isPopular ? "text-accent" : "text-foreground"
                )}>
                  {formatCredits(pack.credits)}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider -mt-1">
                  credits
                </span>

                {/* Price */}
                <span className={cn(
                  "text-sm font-bold mt-0.5",
                  isPopular ? "text-accent" : "text-foreground"
                )}>
                  {isProcessing ? (
                    <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    `$${pack.price.toFixed(2)}`
                  )}
                </span>
              </button>
            )
          })}
        </div>

        {/* Custom amount */}
        <div className="px-5 pb-3">
          <div
            className="border border-border bg-card px-4 py-3.5"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <label
              htmlFor={inputId}
              className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium block mb-3"
            >
              Custom amount
            </label>

            {/* Stepper row */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => nudge(-CUSTOM_STEP)}
                disabled={customCredits <= CUSTOM_MIN || !!loading}
                className="w-8 h-8 flex items-center justify-center border border-border bg-secondary hover:border-accent/40 active:scale-90 transition-all disabled:opacity-30 disabled:pointer-events-none"
                style={{ borderRadius: "var(--radius-button)" }}
                aria-label="Decrease credits"
              >
                <Minus className="w-3 h-3 text-muted-foreground" />
              </button>

              <div className="flex-1 flex items-center gap-2 border border-border bg-background px-3 py-2" style={{ borderRadius: "var(--radius-button)" }}>
                <Zap className="w-3.5 h-3.5 text-accent shrink-0" />
                <input
                  id={inputId}
                  type="number"
                  min={CUSTOM_MIN}
                  max={CUSTOM_MAX}
                  step={CUSTOM_STEP}
                  value={customCredits}
                  onChange={(e) => handleCustomInput(e.target.value)}
                  onBlur={(e) => handleCustomInput(e.target.value)}
                  className="flex-1 bg-transparent text-sm font-mono font-bold text-foreground tabular-nums text-center outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">CR</span>
              </div>

              <button
                onClick={() => nudge(CUSTOM_STEP)}
                disabled={customCredits >= CUSTOM_MAX || !!loading}
                className="w-8 h-8 flex items-center justify-center border border-border bg-secondary hover:border-accent/40 active:scale-90 transition-all disabled:opacity-30 disabled:pointer-events-none"
                style={{ borderRadius: "var(--radius-button)" }}
                aria-label="Increase credits"
              >
                <Plus className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>

            {/* Buy button */}
            <button
              onClick={handleBuyCustom}
              disabled={!!loading}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold",
                "bg-accent text-accent-foreground hover:bg-accent/90",
                "active:scale-[0.98] transition-all duration-[80ms]",
                "disabled:opacity-60 disabled:pointer-events-none"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              {loading === 'custom' ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Buy {customCredits.toLocaleString()} CR
                  <span className="text-accent-foreground/60">·</span>
                  <span className="font-mono">${customPrice.toFixed(2)}</span>
                </>
              )}
            </button>

            <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
              $0.001 / CR · presets above are better value
            </p>
          </div>
        </div>

        {/* Promo code */}
        <div className="px-5 pb-3">
          <div
            className="border border-border bg-card px-4 py-3.5"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium block mb-3">
              Promo code
            </label>
            {promoStatus === 'success' ? (
              <div className="flex items-center gap-2 py-2">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span className="text-sm font-semibold text-success">{promoMessage}</span>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 border border-border bg-background px-3 py-2" style={{ borderRadius: "var(--radius-button)" }}>
                    <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      placeholder="Enter code"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value.toUpperCase())
                        if (promoStatus !== 'idle') setPromoStatus('idle')
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleRedeemPromo()}
                      className="flex-1 bg-transparent text-sm font-mono font-bold text-foreground placeholder:text-muted-foreground/40 placeholder:font-sans placeholder:font-normal outline-none min-w-0 uppercase"
                    />
                  </div>
                  <button
                    onClick={handleRedeemPromo}
                    disabled={!promoCode.trim() || promoStatus === 'loading'}
                    className={cn(
                      "px-4 py-2 text-sm font-bold transition-all duration-[80ms]",
                      "bg-accent text-accent-foreground hover:bg-accent/90",
                      "active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none"
                    )}
                    style={{ borderRadius: "var(--radius-button)" }}
                  >
                    {promoStatus === 'loading' ? (
                      <span className="inline-block w-3.5 h-3.5 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
                    ) : 'Apply'}
                  </button>
                </div>
                {promoStatus === 'error' && (
                  <p className="text-[11px] text-destructive mt-2">{promoMessage}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 my-3 h-px bg-border" />

        {/* Plus upsell — only shown to non-Plus users */}
        {!isPlus ? (
          <div className="px-5 pb-5">
            <button
              onClick={handleUpgradePlus}
              disabled={!!loading}
              className={cn(
                "w-full flex items-center justify-between gap-3",
                "px-4 py-3 border border-accent/30 bg-accent/5",
                "hover:bg-accent/10 active:scale-[0.98] transition-all duration-[80ms]",
                "disabled:opacity-60 disabled:pointer-events-none"
              )}
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <div className="text-left">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs font-bold text-accent uppercase tracking-wider">Ledge Plus</span>
                  <span
                    className="text-[9px] font-bold px-1 py-0.5 bg-accent/20 text-accent border border-accent/30 uppercase tracking-wider"
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    Best deal
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  2× daily credits · Monthly bonus · Streak shields
                </p>
              </div>
              <div className="text-right shrink-0">
                {loading === 'plus' ? (
                  <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="text-base font-bold text-accent font-mono">${PLUS_YEARLY_PRICE}</span>
                    <span className="text-[10px] text-muted-foreground block">/year</span>
                  </>
                )}
              </div>
            </button>
            <p className="text-[10px] text-muted-foreground/50 text-center mt-2">
              ${(PLUS_YEARLY_PRICE / 12).toFixed(2)}/month · cancel anytime
            </p>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <div
              className="flex items-center gap-2 px-3 py-2.5 bg-success/8 border border-success/20"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <span className="text-success text-xs font-bold">✦ Ledge Plus active</span>
              <span className="text-[10px] text-muted-foreground ml-auto">2× daily credits included</span>
            </div>
          </div>
        )}

        </div>{/* end scrollable body */}
      </div>
    </>
  )
}
