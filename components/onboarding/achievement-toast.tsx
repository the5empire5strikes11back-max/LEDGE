"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

interface FirstBetAchievementProps {
  show: boolean
  onDone: () => void
}

// Full canvas confetti burst — bigger than the overlay's CSS version
function ConfettiBurst({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!active || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    const COLORS = ["#F5A623", "#FFD700", "#22c55e", "#3b82f6", "#ec4899", "#f97316", "#a78bfa", "#fff"]
    const particles = Array.from({ length: 90 }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 6 + Math.random() * 10
      return {
        x: canvas.width / 2,
        y: canvas.height * 0.42,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 3 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: 1,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 14,
        isRect: Math.random() > 0.45,
      }
    })

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.18
        p.vx *= 0.98
        p.opacity -= 0.012
        p.rotation += p.rotSpeed
        if (p.opacity <= 0) continue
        alive = true
        ctx.save()
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        if (p.isRect) {
          ctx.fillRect(-p.size * 0.8, -p.size * 0.35, p.size * 1.6, p.size * 0.7)
        } else {
          ctx.beginPath()
          ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
      if (alive) rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [active])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  )
}

export function FirstBetAchievement({ show, onDone }: FirstBetAchievementProps) {
  const [phase, setPhase] = useState<"idle" | "in" | "hold" | "out">("idle")

  useEffect(() => {
    if (!show) return
    setPhase("in")
    const t1 = setTimeout(() => setPhase("hold"), 100)
    const t2 = setTimeout(() => setPhase("out"), 4500)
    const t3 = setTimeout(() => { setPhase("idle"); onDone() }, 5000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [show, onDone])

  if (phase === "idle") return null

  const isIn   = phase === "in"
  const isOut  = phase === "out"

  return (
    <div
      className={cn(
        "fixed inset-0 z-[90] flex flex-col items-center justify-center",
        isOut  ? "animate-out fade-out duration-500" : "animate-in fade-in duration-200"
      )}
      onClick={onDone}
    >
      {/* Dark gold-tinted backdrop */}
      <div className="absolute inset-0 bg-black/85" style={{ background: "radial-gradient(ellipse at center, rgba(245,166,35,0.08) 0%, rgba(0,0,0,0.88) 70%)" }} />

      {/* Confetti */}
      <ConfettiBurst active={phase === "hold"} />

      {/* Card */}
      <div
        className={cn(
          "relative z-10 mx-5 w-full max-w-[340px] flex flex-col items-center gap-5 px-6 py-9",
          "border transition-all duration-500",
          isIn || isOut ? "opacity-0 scale-90 translate-y-4" : "opacity-100 scale-100 translate-y-0"
        )}
        style={{
          borderRadius: "var(--radius-sheet)",
          backgroundColor: "var(--surface-2)",
          borderColor: "rgba(245,166,35,0.35)",
          boxShadow: "0 0 60px rgba(245,166,35,0.15), 0 20px 60px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Trophy */}
        <div
          className="w-20 h-20 flex items-center justify-center text-5xl"
          style={{
            background: "radial-gradient(circle, rgba(245,166,35,0.2) 0%, transparent 70%)",
            animation: "badge-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.15s both",
          }}
        >
          🏆
        </div>

        {/* Headline */}
        <div className="text-center" style={{ animation: "xp-float-in 0.4s ease-out 0.25s both" }}>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1"
            style={{ color: "var(--accent)" }}
          >
            Achievement Unlocked
          </p>
          <p className="text-2xl font-black text-foreground leading-tight">First Prediction</p>
          <p className="text-sm text-muted-foreground mt-1">You just called your first market.</p>
        </div>

        {/* Stat pills */}
        <div
          className="flex items-center gap-3"
          style={{ animation: "xp-float-in 0.4s ease-out 0.4s both" }}
        >
          <div
            className="px-4 py-2 flex flex-col items-center gap-0.5"
            style={{ borderRadius: "var(--radius-card)", background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.25)" }}
          >
            <span className="text-lg font-black" style={{ color: "var(--accent)" }}>+10 XP</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Earned</span>
          </div>
          <div
            className="px-4 py-2 flex flex-col items-center gap-0.5"
            style={{ borderRadius: "var(--radius-card)", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}
          >
            <span className="text-lg font-black text-success">Day 1</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Streak</span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onDone}
          className="w-full py-3 text-sm font-black uppercase tracking-widest text-accent-foreground transition-all active:scale-[0.97]"
          style={{
            borderRadius: "var(--radius-button)",
            backgroundColor: "var(--accent)",
            animation: "xp-float-in 0.4s ease-out 0.55s both",
          }}
        >
          Keep Predicting
        </button>

        {/* Auto-dismiss bar */}
        <div className="w-full h-[2px] rounded-full overflow-hidden bg-border/30">
          <div
            className="h-full w-full origin-left"
            style={{
              backgroundColor: "var(--accent)",
              opacity: 0.5,
              animation: "shrink-bar 4.4s linear 0.1s both",
            }}
          />
        </div>
      </div>
    </div>
  )
}
