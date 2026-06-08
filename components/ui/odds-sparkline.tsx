"use client"

import type { OddsPoint } from "@/lib/odds-history"

interface OddsSparklineProps {
  points: OddsPoint[]
  trend: "up" | "down" | "flat"
  width?: number
  height?: number
}

/**
 * Probability gauge sparkline.
 *
 * Y-axis is always fixed 0–100 so the line's vertical position directly
 * represents the YES probability — a 65% market sits in the upper portion,
 * a 35% market sits low. A subtle 50% reference tick makes above/below
 * immediately readable.
 *
 * For markets with real price movement the arc traces the full history.
 * For flat markets (new/no bets) the filled area acts as a bar gauge.
 *
 * No dependencies — pure SVG.
 */
/** Minimum pct-point range required to show the sparkline. */
const MIN_RANGE = 2

export function OddsSparkline({
  points,
  trend,
  width = 56,
  height = 22,
}: OddsSparklineProps) {
  // Need at least 3 points and a meaningful range to be worth rendering
  if (points.length < 3) return null
  const pcts  = points.map((p) => p.pct)
  const range = Math.max(...pcts) - Math.min(...pcts)
  if (range < MIN_RANGE) return null

  // Color by >/<50% so it matches the big number's green/red at a glance
  const lastPct = points[points.length - 1].pct
  const color =
    lastPct > 50 ? "var(--color-success, #22c55e)" :
    lastPct < 50 ? "var(--color-danger,  #ef4444)" :
                   "var(--color-muted-foreground, #6B6B7B)"

  const pad = 2
  const drawW = width  - pad * 2
  const drawH = height - pad * 2

  // Fixed 0–100 axis
  const toXY = (ts: number, pct: number, minTs: number, tsRange: number) => ({
    x: pad + ((ts - minTs) / tsRange) * drawW,
    y: pad + drawH - (pct / 100) * drawH,
  })

  // 50% reference line — faint horizontal tick
  const midY = pad + drawH - (50 / 100) * drawH

  const minTs   = points[0].ts
  const maxTs   = points[points.length - 1].ts
  const tsRange = Math.max(maxTs - minTs, 1)

  const coords = points.map((p) => toXY(p.ts, p.pct, minTs, tsRange))
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")

  const first = coords[0]
  const last  = coords[coords.length - 1]
  const bottomY = (height - pad).toFixed(1)

  // Area fills from the line DOWN to the chart bottom (= YES territory)
  const areaPath = `${linePath} L${last.x.toFixed(1)},${bottomY} L${first.x.toFixed(1)},${bottomY} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden>
      {/* 50% reference line */}
      <line x1={pad} y1={midY} x2={width - pad} y2={midY}
        stroke="currentColor" strokeOpacity={0.08} strokeWidth={1} strokeDasharray="2 2" />
      {/* Area fill */}
      <path d={areaPath} fill={color} opacity={0.22} />
      {/* Price line */}
      <path d={linePath} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Terminal dot */}
      <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r={2} fill={color} />
    </svg>
  )
}
