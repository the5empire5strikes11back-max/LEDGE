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
import { CHEST_AMOUNTS, type ChestTier } from "@/lib/game-engine"

interface MysteryChestModalProps {
  open: boolean
  onClose: () => void
  tier: ChestTier
  amount: number
}

const TIER_CONFIG: Record<ChestTier, { emoji: string; glow: string; bgFrom: string; label: string; sound: string }> = {
  common:    { emoji: "📦", glow: "rgba(107,107,123,0.4)",  bgFrom: "#6B6B7B", label: "Common Chest",    sound: "soft" },
  rare:      { emoji: "💎", glow: "rgba(59,130,246,0.5)",   bgFrom: "#3B82F6", label: "Rare Chest",      sound: "medium" },
  epic:      { emoji: "🔮", glow: "rgba(168,85,247,0.6)",   bgFrom: "#A855F7", label: "Epic Chest",      sound: "epic" },
  legendary: { emoji: "👑", glow: "rgba(245,166,35,0.7)",   bgFrom: "#F5A623", label: "Legendary Chest", sound: "legendary" },
}

export function MysteryChestModal({ open, onClose, tier, amount }: MysteryChestModalProps) {
  const [phase, setPhase] = useState<"idle" | "shake" | "open" | "reveal">("idle")
  const [hasOpened, setHasOpened] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number | undefined>(undefined)
  const config = TIER_CONFIG[tier]
  const chestAmounts = CHEST_AMOUNTS[tier]

  useEffect(() => {
    if (!open) {
      setPhase("idle")
      setHasOpened(false)
    }
  }, [open])

  useEffect(() => {
    if (phase !== "open" || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = 300
    canvas.height = 300

    interface Particle {
      x: number; y: number; vx: number; vy: number
      size: number; opacity: number; color: string; rotation: number; rotSpeed: number
    }

    const particles: Particle[] = []
    const tierColor = config.bgFrom
    const extras = ["#FFD700", "#FFFFFF", tierColor]

    for (let i = 0; i < 100; i++) {
      const angle = (Math.PI * 2 * i) / 100 + Math.random() * 0.4
      const vel = 3 + Math.random() * 7
      particles.push({
        x: 150, y: 150,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel - 2,
        size: 2 + Math.random() * 5,
        opacity: 1,
        color: extras[Math.floor(Math.random() * extras.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
      })
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx; p.y += p.vy
        p.vy += 0.12; p.vx *= 0.98
        p.opacity -= 0.01; p.rotation += p.rotSpeed
        if (p.opacity <= 0) { particles.splice(i, 1); continue }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation * Math.PI / 180)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = tier === "legendary" ? 12 : 6
        // Stars for legendary, diamonds for epic, squares for rare, circles for common
        if (tier === "legendary") {
          ctx.beginPath()
          for (let j = 0; j < 5; j++) {
            const r1 = p.size, r2 = p.size * 0.4
            const a1 = (j * 4 * Math.PI) / 5 - Math.PI / 2
            const a2 = ((j * 4 + 2) * Math.PI) / 5 - Math.PI / 2
            if (j === 0) ctx.moveTo(r1 * Math.cos(a1), r1 * Math.sin(a1))
            else ctx.lineTo(r1 * Math.cos(a1), r1 * Math.sin(a1))
            ctx.lineTo(r2 * Math.cos(a2), r2 * Math.sin(a2))
          }
          ctx.closePath(); ctx.fill()
        } else {
          ctx.beginPath()
          ctx.moveTo(0, -p.size)
          ctx.lineTo(p.size * 0.6, 0)
          ctx.lineTo(0, p.size)
          ctx.lineTo(-p.size * 0.6, 0)
          ctx.closePath(); ctx.fill()
        }
        ctx.restore()
      }
      if (particles.length > 0) animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    setTimeout(() => setPhase("reveal"), 600)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [phase, tier, config.bgFrom])

  const handleTap = () => {
    if (hasOpened) return
    setHasOpened(true)
    setPhase("shake")
    setTimeout(() => setPhase("open"), 600)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="bg-card border-border max-w-md overflow-hidden"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-1000"
          style={{
            background: phase === "open" || phase === "reveal"
              ? `radial-gradient(circle at 50% 40%, ${config.glow} 0%, transparent 65%)`
              : "transparent"
          }}
        />

        <DialogTitle className="sr-only">Mystery Chest</DialogTitle>
        <DialogDescription className="sr-only">Open your mystery chest</DialogDescription>

        <div className="relative z-10 flex flex-col items-center py-8 gap-5">
          {/* Tier label */}
          <div
            className="flex items-center gap-2 px-3 py-1 border"
            style={{
              borderRadius: "9999px",
              borderColor: `${config.bgFrom}50`,
              background: `${config.bgFrom}20`,
              color: config.bgFrom
            }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest">{config.label}</span>
          </div>

          {/* Chest */}
          <div className="relative w-48 h-48 flex items-center justify-center">
            {(phase === "open" || phase === "reveal") && (
              <canvas
                ref={canvasRef}
                className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ width: 300, height: 300 }}
              />
            )}

            <button
              onClick={handleTap}
              disabled={hasOpened}
              className={cn(
                "relative z-10 w-32 h-32 flex items-center justify-center transition-all duration-300 cursor-pointer select-none",
                "border-2 bg-surface",
                phase === "shake" && "animate-[wiggle_0.1s_ease-in-out_5]",
                phase === "open" && "scale-110",
                phase === "reveal" && "scale-75 opacity-0",
                !hasOpened && "hover:scale-105 active:scale-95"
              )}
              style={{
                borderRadius: "var(--radius-card)",
                borderColor: `${config.bgFrom}60`,
                boxShadow: `0 0 30px ${config.glow}`,
              }}
            >
              <span
                className={cn(
                  "text-6xl transition-all duration-300",
                  phase === "shake" && "animate-bounce",
                  phase === "open" && "text-7xl"
                )}
              >
                {config.emoji}
              </span>
            </button>
          </div>

          {/* Pre-open state */}
          {phase === "idle" && (
            <div className="text-center space-y-1 animate-in fade-in duration-300">
              <p className="text-sm font-semibold text-foreground">Mystery Chest Earned</p>
              <p className="text-xs text-muted-foreground">
                {chestAmounts.min.toLocaleString()} – {chestAmounts.max.toLocaleString()} credits inside
              </p>
              <p className="text-[10px] text-accent/70 mt-2">Tap to open</p>
            </div>
          )}

          {/* Reveal state */}
          {phase === "reveal" && (
            <div className="text-center space-y-2 animate-in slide-in-from-bottom-4 fade-in duration-500">
              <div
                className="text-6xl font-mono font-bold tabular-nums"
                style={{ color: config.bgFrom, filter: `drop-shadow(0 0 20px ${config.glow})` }}
              >
                +{amount.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground uppercase tracking-widest">credits added</div>
            </div>
          )}

          {/* Claim button */}
          {phase === "reveal" && (
            <Button
              onClick={onClose}
              className="w-full font-semibold text-base py-5 mt-2 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-300"
              style={{
                background: config.bgFrom,
                color: "#000",
                borderRadius: "var(--radius-button)"
              }}
            >
              Claim {amount.toLocaleString()} CR
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
