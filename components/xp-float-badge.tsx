"use client"

import { useEffect, useState } from "react"

interface XpFloatBadgeProps {
  amount: number
  /** Increment this key to re-trigger the animation without changing amount */
  triggerKey: number
}

export function XpFloatBadge({ amount, triggerKey }: XpFloatBadgeProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (triggerKey === 0) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 1400)
    return () => clearTimeout(t)
  }, [triggerKey])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-[80] pointer-events-none"
      style={{ animation: "xp-float-in 0.3s ease-out both, xp-badge-out 0.4s ease-in 1s both" }}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 border text-sm font-black"
        style={{
          borderRadius: "9999px",
          backgroundColor: "rgba(245,166,35,0.15)",
          borderColor: "rgba(245,166,35,0.4)",
          color: "var(--accent)",
          backdropFilter: "blur(8px)",
        }}
      >
        ⚡ +{amount} XP
      </div>
    </div>
  )
}
