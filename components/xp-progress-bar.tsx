"use client"

import { useEffect, useRef, useState } from "react"
import { xpProgress } from "@/lib/game-engine"

interface XpProgressBarProps {
  xp: number
}

export function XpProgressBar({ xp }: XpProgressBarProps) {
  const progress = xpProgress(xp)
  const [pulse, setPulse] = useState(false)
  const prevXp = useRef(xp)

  useEffect(() => {
    if (xp > prevXp.current) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 800)
      prevXp.current = xp
      return () => clearTimeout(t)
    }
    prevXp.current = xp
  }, [xp])

  return (
    <div className="w-full h-[2px] bg-border/40 overflow-hidden">
      <div
        className="h-full transition-[width] duration-700 ease-out"
        style={{
          width: `${progress.percent}%`,
          backgroundColor: pulse ? "#fff" : "var(--accent)",
          boxShadow: pulse ? "0 0 8px 2px rgba(245,166,35,0.8)" : "none",
          transition: "width 0.7s ease-out, background-color 0.3s, box-shadow 0.3s",
        }}
      />
    </div>
  )
}
