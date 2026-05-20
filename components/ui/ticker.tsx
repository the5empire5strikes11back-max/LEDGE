"use client"

import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"

interface TickerProps {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  className?: string
  duration?: number
}

export function Ticker({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
  duration = 500,
}: TickerProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const [direction, setDirection] = useState<"up" | "down" | null>(null)
  const previousValue = useRef(value)

  useEffect(() => {
    if (value !== previousValue.current) {
      setDirection(value > previousValue.current ? "up" : "down")
      
      const startValue = previousValue.current
      const endValue = value
      const startTime = performance.now()
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // Easing function
        const easeOutCubic = 1 - Math.pow(1 - progress, 3)
        const currentValue = startValue + (endValue - startValue) * easeOutCubic
        
        setDisplayValue(currentValue)
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          setDirection(null)
        }
      }
      
      requestAnimationFrame(animate)
      previousValue.current = value
    }
  }, [value, duration])

  return (
    <span
      className={cn(
        "font-mono tabular-nums inline-flex items-center transition-colors duration-200",
        direction === "up" && "text-success",
        direction === "down" && "text-danger",
        className
      )}
    >
      {prefix}
      {displayValue.toFixed(decimals)}
      {suffix}
    </span>
  )
}

interface TickerPercentProps {
  value: number
  className?: string
}

export function TickerPercent({ value, className }: TickerPercentProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const [animating, setAnimating] = useState(false)
  const previousValue = useRef(value)

  useEffect(() => {
    if (value !== previousValue.current) {
      setAnimating(true)
      
      const startValue = previousValue.current
      const endValue = value
      const startTime = performance.now()
      const duration = 400
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const easeOutCubic = 1 - Math.pow(1 - progress, 3)
        const currentValue = startValue + (endValue - startValue) * easeOutCubic
        
        setDisplayValue(currentValue)
        
        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          setAnimating(false)
        }
      }
      
      requestAnimationFrame(animate)
      previousValue.current = value
    }
  }, [value])

  const isPositive = displayValue >= 0

  return (
    <span
      className={cn(
        "font-mono tabular-nums inline-flex items-center gap-0.5 transition-all duration-200",
        isPositive ? "text-success" : "text-danger",
        animating && "scale-105",
        className
      )}
    >
      <span className="text-xs">{isPositive ? "▲" : "▼"}</span>
      {Math.abs(displayValue).toFixed(1)}%
    </span>
  )
}
