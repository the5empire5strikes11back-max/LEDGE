"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import { Flame } from "lucide-react"

interface Particle {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  rotation: number
  rotationSpeed: number
  color: string
}

// White particle burst effect
function ParticleBurst({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const animationRef = useRef<number | undefined>(undefined)

  const createParticles = useCallback(() => {
    const particles: Particle[] = []
    const colors = ["#FFFFFF", "#E2E8F0", "#C0C0C0", "#D0D0D0", "#F0F0F0"]
    
    for (let i = 0; i < 60; i++) {
      const angle = (Math.PI * 2 * i) / 60 + Math.random() * 0.5
      const velocity = 3 + Math.random() * 6
      particles.push({
        id: i,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        size: 2 + Math.random() * 4,
        opacity: 1,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
      })
    }
    return particles
  }, [])

  useEffect(() => {
    if (!active || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size
    canvas.width = 300
    canvas.height = 200

    // Create particles centered
    particlesRef.current = createParticles().map((p) => ({
      ...p,
      x: canvas.width / 2,
      y: canvas.height / 2,
    }))

    const animate = () => {
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15, // gravity
          vx: p.vx * 0.99, // friction
          opacity: p.opacity - 0.015,
          rotation: p.rotation + p.rotationSpeed,
        }))
        .filter((p) => p.opacity > 0)

      particlesRef.current.forEach((p) => {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8

        // Draw diamond shape
        ctx.beginPath()
        ctx.moveTo(0, -p.size)
        ctx.lineTo(p.size * 0.6, 0)
        ctx.lineTo(0, p.size)
        ctx.lineTo(-p.size * 0.6, 0)
        ctx.closePath()
        ctx.fill()

        ctx.restore()
      })

      if (particlesRef.current.length > 0) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [active, createParticles])

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
      style={{ width: 300, height: 200 }}
    />
  )
}

// Animated credit counter with dramatic effect
function CreditDropCounter({
  value,
  onComplete,
}: {
  value: number
  onComplete: () => void
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const [phase, setPhase] = useState<"counting" | "complete">("counting")
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const duration = 2000 // 2 seconds for dramatic effect
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Custom easing - fast start, slow end for suspense
      const easeOutExpo = 1 - Math.pow(2, -10 * progress)
      const currentValue = Math.floor(value * easeOutExpo)

      setDisplayValue(currentValue)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setPhase("complete")
        onComplete()
      }
    }

    // Delay start slightly for anticipation
    setTimeout(() => {
      requestAnimationFrame(animate)
    }, 300)
  }, [value, onComplete])

  return (
    <div className="relative">
      {/* Glow backdrop */}
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-3xl transition-all duration-500",
          phase === "complete" ? "bg-accent/30 scale-150" : "bg-accent/10 scale-100"
        )}
      />

      {/* Main number */}
      <div
        className={cn(
          "relative font-mono tabular-nums font-bold tracking-tighter transition-all duration-300",
          "text-5xl sm:text-6xl",
          phase === "complete" && "scale-110"
        )}
      >
        <span className="text-accent drop-shadow-[0_0_20px_rgba(245,166,35,0.5)]">
          +{displayValue.toLocaleString()}
        </span>
      </div>

      {/* Credits label */}
      <div
        className={cn(
          "text-center text-muted-foreground uppercase tracking-widest text-sm mt-2 transition-all duration-300",
          phase === "complete" ? "opacity-100" : "opacity-50"
        )}
      >
        credits
      </div>
    </div>
  )
}

// Rank multiplier badge
function RankMultiplierBadge({
  rank,
  multiplier,
  visible,
}: {
  rank: RankKey
  multiplier: number
  visible: boolean
}) {
  const config = RANKS[rank]

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-500",
        config.bg,
        config.border,
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
      style={{ borderRadius: "9999px" }}
    >
      <span className={cn("text-lg", config.color)}>{config.icon}</span>
      <span className={cn("font-semibold text-sm", config.color)}>
        {multiplier}x {config.label} Bonus
      </span>
    </div>
  )
}

// Streak bonus display
function StreakBonus({
  amount,
  streakDays,
  visible,
}: {
  amount: number
  streakDays: number
  visible: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-success transition-all duration-500 delay-200",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
    >
      <Flame className="w-5 h-5 text-success shrink-0" />
      <span className="font-mono font-semibold tabular-nums">
        +{amount.toLocaleString()} bonus
      </span>
      <span className="text-muted-foreground">—</span>
      <span className="text-muted-foreground">{streakDays} day streak!</span>
    </div>
  )
}

// Balance after drop
function TotalBalance({
  balance,
  visible,
}: {
  balance: number
  visible: boolean
}) {
  const formatBalance = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toLocaleString()
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-5 py-3 bg-surface/80 border border-border rounded-lg transition-all duration-500 delay-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <span className="text-sm text-muted-foreground">New Balance</span>
      <span className="font-mono text-xl font-bold tabular-nums text-foreground">
        {formatBalance(balance)}
      </span>
      <span className="text-sm text-muted-foreground">credits</span>
    </div>
  )
}

interface DailyDropModalProps {
  open: boolean
  onClose: () => void
  baseAmount: number
  rank?: RankKey
  rankMultiplier?: number
  streakDays?: number
  streakBonus?: number
  currentBalance: number
}

export function DailyDropModal({
  open,
  onClose,
  baseAmount,
  rank,
  rankMultiplier = 1,
  streakDays = 0,
  streakBonus = 0,
  currentBalance,
}: DailyDropModalProps) {
  const [showParticles, setShowParticles] = useState(false)
  const [countComplete, setCountComplete] = useState(false)
  const [showExtras, setShowExtras] = useState(false)

  // Total amount including bonuses
  const totalAmount = baseAmount * rankMultiplier + streakBonus
  const newBalance = currentBalance + totalAmount

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setShowParticles(false)
      setCountComplete(false)
      setShowExtras(false)

      // Trigger particles after a short delay
      const timer = setTimeout(() => setShowParticles(true), 500)
      return () => clearTimeout(timer)
    }
  }, [open])

  const handleCountComplete = useCallback(() => {
    setCountComplete(true)
    // Show extras after count completes
    setTimeout(() => setShowExtras(true), 200)
  }, [])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="bg-card border-border max-w-md overflow-hidden"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {/* Ambient glow background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center py-6">
          {/* Header */}
          <DialogTitle className="sr-only">Daily Credit Drop</DialogTitle>
          <DialogDescription className="sr-only">
            Your daily credit drop reward
          </DialogDescription>

          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/30 rounded-full mb-3">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs uppercase tracking-widest text-accent font-semibold">
                Daily Drop
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              Your prediction credits are here
            </p>
          </div>

          {/* Main credit amount with particles */}
          <div className="relative mb-8 py-8">
            <ParticleBurst active={showParticles} />
            <CreditDropCounter value={totalAmount} onComplete={handleCountComplete} />
          </div>

          {/* Bonuses section */}
          <div className="flex flex-col items-center gap-3 mb-8 min-h-[80px]">
            {/* Rank multiplier */}
            {rank && rankMultiplier > 1 && (
              <RankMultiplierBadge
                rank={rank}
                multiplier={rankMultiplier}
                visible={showExtras}
              />
            )}

            {/* Streak bonus */}
            {streakDays > 0 && streakBonus > 0 && (
              <StreakBonus
                amount={streakBonus}
                streakDays={streakDays}
                visible={showExtras}
              />
            )}

            {/* New total balance */}
            <TotalBalance balance={newBalance} visible={showExtras} />
          </div>

          {/* CTA Button */}
          <Button
            onClick={onClose}
            className={cn(
              "w-full bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base py-6 transition-all duration-500",
              countComplete ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
            style={{ borderRadius: "var(--radius-button)" }}
          >
            Start Predicting
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
