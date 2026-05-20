"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface CountdownProps {
  endTime: Date
  resolved?: boolean
  className?: string
}

function getTimeLeft(endTime: Date) {
  const diff = endTime.getTime() - Date.now()
  if (diff <= 0) return null
  const totalSeconds = Math.floor(diff / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds, totalSeconds }
}

export function Countdown({ endTime, resolved, className }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(endTime))

  useEffect(() => {
    if (resolved) return
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(endTime))
    }, 1000)
    return () => clearInterval(interval)
  }, [endTime, resolved])

  if (resolved) {
    return <span className={cn("text-xs text-muted-foreground font-mono", className)}>Resolved</span>
  }

  if (!timeLeft) {
    return <span className={cn("text-xs text-danger font-mono font-semibold animate-pulse", className)}>Closing…</span>
  }

  const { days, hours, minutes, seconds, totalSeconds } = timeLeft

  // Color urgency tiers
  const isCritical = totalSeconds < 7200   // < 2h  → red + pulse
  const isWarning  = totalSeconds < 86400  // < 24h → amber

  const colorClass = isCritical
    ? "text-danger"
    : isWarning
    ? "text-accent"
    : "text-muted-foreground"

  let label: string
  if (days >= 2) {
    label = `${days}d ${hours}h`
  } else if (days === 1) {
    label = `${hours + 24}h ${minutes}m`
  } else if (hours >= 1) {
    label = `${hours}h ${minutes}m`
  } else {
    // Under 1 hour — show ticking seconds
    label = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  return (
    <span
      className={cn(
        "text-xs font-mono font-medium tabular-nums",
        colorClass,
        isCritical && "animate-pulse",
        className
      )}
      suppressHydrationWarning
    >
      {isCritical && "⚡ "}{label}
    </span>
  )
}
