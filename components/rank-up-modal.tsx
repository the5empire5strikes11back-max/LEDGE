"use client"

import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import { RANK_DAILY_MULTIPLIER } from "@/lib/game-engine"

interface RankUpModalProps {
  open: boolean
  onClose: () => void
  newRank: RankKey
  previousRank: RankKey
}

export function RankUpModal({ open, onClose, newRank, previousRank }: RankUpModalProps) {
  const [phase, setPhase] = useState<"enter" | "reveal" | "details">("enter")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number | undefined>(undefined)

  const rankConfig = RANKS[newRank]
  const prevConfig = RANKS[previousRank]
  const newMultiplier = RANK_DAILY_MULTIPLIER[newRank]

  useEffect(() => {
    if (!open) {
      setPhase("enter")
      return
    }

    const t1 = setTimeout(() => setPhase("reveal"), 400)
    const t2 = setTimeout(() => setPhase("details"), 1200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [open])

  useEffect(() => {
    if (phase !== "reveal" || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = 320
    canvas.height = 320

    interface Spark {
      x: number; y: number; vx: number; vy: number
      size: number; opacity: number; color: string
    }

    const sparks: Spark[] = []
    const colors = ["#F5A623", "#FFD700", "#FFA500", "#FFFFFF", "#FFE4B5"]

    for (let i = 0; i < 80; i++) {
      const angle = (Math.PI * 2 * i) / 80 + Math.random() * 0.3
      const vel = 2 + Math.random() * 5
      sparks.push({
        x: 160, y: 160,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel,
        size: 1.5 + Math.random() * 3,
        opacity: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.x += s.vx
        s.y += s.vy
        s.vy += 0.08
        s.vx *= 0.99
        s.opacity -= 0.012
        if (s.opacity <= 0) { sparks.splice(i, 1); continue }
        ctx.save()
        ctx.globalAlpha = s.opacity
        ctx.fillStyle = s.color
        ctx.shadowColor = s.color
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      if (sparks.length > 0) animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [phase])

  const perks = [
    `Daily drop: ${newMultiplier}× multiplier`,
    rankConfig.label === "Forecaster" ? "Access to prediction analytics" :
    rankConfig.label === "Analyst" ? "Priority market feed" :
    rankConfig.label === "Oracle" ? "Private Oracle circle access" :
    rankConfig.label === "Market Maker" ? "Create your own markets" :
    rankConfig.label === "Jury Lead" ? "Dispute resolution power + max payouts" :
    "Standard features unlocked",
  ]

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="bg-card border-border max-w-md overflow-hidden"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {/* Glow pulse */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className={cn(
              "absolute inset-0 transition-all duration-1000",
              phase === "reveal" ? "opacity-100" : "opacity-0"
            )}
            style={{ background: `radial-gradient(circle at 50% 50%, ${rankConfig.color.replace("text-", "")} 0%, transparent 70%)`, opacity: 0.06 }}
          />
        </div>

        <DialogTitle className="sr-only">Rank Up</DialogTitle>
        <DialogDescription className="sr-only">You've reached a new rank</DialogDescription>

        <div className="relative z-10 flex flex-col items-center py-8 gap-5">
          {/* Label */}
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/30 transition-all duration-500",
              phase !== "enter" ? "opacity-100" : "opacity-0 -translate-y-2"
            )}
            style={{ borderRadius: "9999px" }}
          >
            <span className="text-accent text-[10px] font-semibold uppercase tracking-widest">Rank Up</span>
          </div>

          {/* Rank icon with spark canvas */}
          <div className="relative w-40 h-40 flex items-center justify-center">
            {phase === "reveal" && (
              <canvas
                ref={canvasRef}
                className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ width: 320, height: 320 }}
              />
            )}
            <div
              className={cn(
                "relative z-10 flex items-center justify-center w-28 h-28 border-2 transition-all duration-700",
                rankConfig.bg, rankConfig.border,
                phase !== "enter" ? "scale-100 opacity-100" : "scale-50 opacity-0"
              )}
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <span className="text-6xl">{rankConfig.icon}</span>
            </div>
          </div>

          {/* Rank name */}
          <div
            className={cn(
              "text-center transition-all duration-500 delay-200",
              phase !== "enter" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
              {prevConfig.label} →
            </p>
            <h2 className={cn("text-4xl font-bold", rankConfig.color)}>{rankConfig.label}</h2>
          </div>

          {/* Perks */}
          <div
            className={cn(
              "w-full flex flex-col gap-2 transition-all duration-500 delay-500",
              phase === "details" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            {perks.map((perk) => (
              <div
                key={perk}
                className="flex items-center gap-3 px-4 py-2.5 bg-surface border border-border"
                style={{ borderRadius: "var(--radius-button)" }}
              >
                <span className="text-success text-sm">✓</span>
                <span className="text-sm text-foreground">{perk}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Button
            onClick={onClose}
            className={cn(
              "w-full font-semibold text-base py-6 transition-all duration-500 delay-700",
              phase === "details" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
            style={{
              background: rankConfig.color.includes("amber") || rankConfig.color.includes("yellow") ? "#F5A623" : undefined,
              borderRadius: "var(--radius-button)"
            }}
          >
            Let's Go 🔥
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
