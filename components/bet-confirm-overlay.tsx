"use client"

import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

interface BetConfirmOverlayProps {
  side: "yes" | "no"
  amount: number
  potentialPayout: number
  marketTitle: string
  xpGain: number
  isFirstBet?: boolean
  onDone: () => void
}

const CONFETTI_COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ec4899", "#8b5cf6", "#f97316"]

export function BetConfirmOverlay({
  side,
  amount,
  potentialPayout,
  marketTitle,
  xpGain,
  isFirstBet = false,
  onDone,
}: BetConfirmOverlayProps) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const exit = setTimeout(() => setExiting(true), 2100)
    const done = setTimeout(() => onDone(), 2500)
    return () => { clearTimeout(exit); clearTimeout(done) }
  }, [onDone])

  const isYes = side === "yes"
  const accentHex = isYes ? "#10b981" : "#ef4444"
  const sideLabel = isYes ? "YES" : "NO"

  const particles = useMemo(() =>
    isFirstBet
      ? Array.from({ length: 30 }, (_, i) => ({
          id: i,
          left: `${(i / 30) * 100 + (Math.random() * 3 - 1.5)}%`,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          delay: `${(Math.random() * 0.4).toFixed(2)}s`,
          duration: `${(0.9 + Math.random() * 0.7).toFixed(2)}s`,
          rotate: `${Math.floor(Math.random() * 360)}deg`,
          size: `${6 + Math.floor(Math.random() * 7)}px`,
        }))
      : [],
  [isFirstBet])

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : n.toLocaleString()

  return (
    <div
      className={cn(
        "fixed inset-0 z-[70] flex items-center justify-center",
        exiting ? "animate-out fade-out duration-400" : "animate-in fade-in duration-150"
      )}
      onClick={onDone}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Confetti — first bet only */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 pointer-events-none"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: "2px",
            animation: `confetti-fall ${p.duration} ${p.delay} ease-in forwards`,
            "--r": p.rotate,
          } as React.CSSProperties}
        />
      ))}

      {/* Card */}
      <div
        className={cn(
          "relative z-10 mx-5 w-full max-w-[320px] bg-surface-2 border border-border flex flex-col items-center gap-4 px-6 py-8",
          exiting ? "animate-out zoom-out-95 fade-out duration-300" : "animate-in zoom-in-95 duration-300"
        )}
        style={{ borderRadius: "var(--radius-sheet)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated checkmark circle */}
        <div
          className="w-[68px] h-[68px] rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${accentHex}18` }}
        >
          <svg viewBox="0 0 52 52" className="w-11 h-11" fill="none">
            <circle
              cx="26" cy="26" r="23"
              stroke={accentHex}
              strokeWidth="2"
              fill="none"
              style={{ animation: "fade-in 0.2s ease-out forwards" }}
            />
            <path
              d="M14.5 26.5 L22.5 34.5 L37.5 18"
              stroke={accentHex}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="38"
              strokeDashoffset="38"
              style={{ animation: "check-draw 0.45s ease-out 0.15s forwards" }}
            />
          </svg>
        </div>

        {/* Side badge */}
        <div
          className="px-5 py-2 text-sm font-black uppercase tracking-widest text-white"
          style={{
            backgroundColor: accentHex,
            borderRadius: "var(--radius-button)",
            animation: "badge-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) 0.1s both",
          }}
        >
          {sideLabel} locked in
        </div>

        {/* Market title */}
        <p className="text-center text-[13px] font-medium text-foreground leading-snug line-clamp-2 px-1">
          {marketTitle}
        </p>

        {/* Bet / payout row */}
        <div
          className="w-full flex items-stretch"
          style={{ borderRadius: "var(--radius-card)", overflow: "hidden", border: "1px solid var(--border)" }}
        >
          <div className="flex-1 text-center py-2.5 bg-surface">
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-0.5">Stake</p>
            <p className="font-mono text-[15px] font-bold text-foreground">{fmt(amount)} CR</p>
          </div>
          <div className="w-px bg-border" />
          <div className="flex-1 text-center py-2.5 bg-surface">
            <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-0.5">Max win</p>
            <p
              className="font-mono text-[15px] font-bold"
              style={{ color: accentHex }}
            >
              {fmt(potentialPayout)} CR
            </p>
          </div>
        </div>

        {/* XP badge */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 border"
          style={{
            borderRadius: "var(--radius-badge)",
            backgroundColor: "rgba(245,166,35,0.12)",
            borderColor: "rgba(245,166,35,0.3)",
            animation: "xp-float-in 0.35s ease-out 0.5s both",
          }}
        >
          <span className="text-sm font-black" style={{ color: "var(--accent)" }}>+{xpGain} XP</span>
          {xpGain > 10 && (
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              BOOSTED
            </span>
          )}
        </div>

        {/* Auto-dismiss progress bar */}
        <div className="w-full h-[2px] rounded-full overflow-hidden bg-border/30">
          <div
            className="h-full w-full origin-left"
            style={{
              backgroundColor: "var(--accent)",
              animation: "shrink-bar 2.1s linear 0.4s both",
            }}
          />
        </div>

        {/* Tap to dismiss hint */}
        <p className="text-[10px] text-muted-foreground/50 tracking-wider">tap anywhere to dismiss</p>
      </div>
    </div>
  )
}
