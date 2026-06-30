"use client"

import { useEffect, useState } from "react"

const COLORS = ["#FFFFFF", "#22c55e", "#3b82f6", "#ec4899", "#f97316", "#a78bfa", "#ef4444", "#06b6d4"]

interface Particle {
  id: number
  color: string
  w: number
  h: number
  dx: number
  dy: number
  rot: number
  dur: number
  del: number
  circle: boolean
}

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = Math.random() * Math.PI * 2
    const dist = 28 + Math.random() * 58
    const isCircle = Math.random() > 0.55
    const baseSize = 4 + Math.random() * 5
    return {
      id: i,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: isCircle ? baseSize : baseSize * 1.6,
      h: isCircle ? baseSize : baseSize * 0.55,
      dx: Math.cos(angle) * dist * 1.5,
      dy: Math.sin(angle) * dist,
      rot: (Math.random() - 0.5) * 900,
      dur: 1.5 + Math.random() * 1.4,
      del: Math.random() * 0.4,
      circle: isCircle,
    }
  })
}

interface ConfettiProps {
  active: boolean
  onDone?: () => void
}

export function Confetti({ active, onDone }: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!active) return
    setParticles(makeParticles(65))
    const t = setTimeout(() => {
      setParticles([])
      onDone?.()
    }, 3400)
    return () => clearTimeout(t)
  }, [active, onDone])

  if (!particles.length) return null

  // Generate per-particle keyframes to allow unique trajectories
  const keyframes = particles
    .map(
      (p) =>
        `@keyframes cf${p.id}{` +
        `0%{transform:translate(-50%,-50%) translate(0,0) rotate(0deg) scale(1);opacity:1}` +
        `65%{opacity:.9}` +
        `100%{transform:translate(-50%,-50%) translate(${p.dx}vw,${p.dy}vh) rotate(${p.rot}deg) scale(0.15);opacity:0}}`
    )
    .join("")

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden" aria-hidden>
      <style>{keyframes}</style>
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: "50%",
            top: "42%",
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            borderRadius: p.circle ? "50%" : "1px",
            animation: `cf${p.id} ${p.dur}s ${p.del}s cubic-bezier(.23,1,.32,1) both`,
          }}
        />
      ))}
    </div>
  )
}
