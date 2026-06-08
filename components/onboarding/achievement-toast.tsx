"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Target } from "lucide-react"
import { Confetti } from "./confetti"

interface FirstBetAchievementProps {
  show: boolean
  onDone: () => void
}

export function FirstBetAchievement({ show, onDone }: FirstBetAchievementProps) {
  const [visible, setVisible] = useState(false)
  const [confettiActive, setConfettiActive] = useState(false)

  useEffect(() => {
    if (!show) return
    // Small stagger so the animation reads correctly
    const t1 = setTimeout(() => { setVisible(true); setConfettiActive(true) }, 80)
    const t2 = setTimeout(() => { setVisible(false) }, 3600)
    const t3 = setTimeout(() => { onDone() }, 4100)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [show, onDone])

  if (!show && !visible) return null

  return (
    <>
      <Confetti active={confettiActive} onDone={() => setConfettiActive(false)} />

      {/* Toast card */}
      <div
        className={cn(
          "fixed z-[500] left-1/2 -translate-x-1/2",
          // Sits above mobile bottom nav, below desktop edge
          "bottom-[88px] lg:bottom-10",
          "transition-all duration-500 ease-out will-change-transform",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
        )}
        style={{ width: "calc(100% - 2rem)", maxWidth: 340 }}
      >
        <div
          className="bg-accent px-5 py-4 flex items-center gap-4 shadow-2xl"
          style={{
            borderRadius: "var(--radius-card)",
            boxShadow: "0 0 40px rgba(245,166,35,0.35), 0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          <Target className="w-8 h-8 shrink-0 text-accent-foreground" />
          <div className="min-w-0">
            <p className="text-accent-foreground text-sm font-black uppercase tracking-widest leading-tight">
              First Prediction!
            </p>
            <p className="text-accent-foreground/70 text-xs mt-0.5 font-medium">
              Achievement unlocked · +50 bonus XP
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
