"use client"

import type { OddsPoint } from "@/lib/odds-history"

interface OddsSparklineProps {
  points: OddsPoint[]
  trend: "up" | "down" | "flat"
  width?: number
  height?: number
}

/**
 * Pure SVG sparkline for yes_percent movement.
 * No Recharts, no dependencies — renders ~200 bytes of SVG.
 * Shows a flat dashed baseline when fewer than 2 points exist.
 */
export function OddsSparkline({
  points,
  trend,
  width = 56,
  height = 16,
}: OddsSparklineProps) {
  const color =
    trend === "up"   ? "var(--color-success, #22c55e)" :
    trend === "down" ? "var(--color-danger, #ef4444)"  :
                       "var(--color-muted-foreground, #6B6B7B)"

  // Not enough data yet — flat dashed placeholder
  if (points.length < 2) {
    const y = height / 2
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden>
        <line
          x1={2} y1={y} x2={width - 2} y2={y}
          stroke="currentColor" strokeOpacity={0.12}
          strokeWidth={1} strokeDasharray="2 2"
        />
      </svg>
    )
  }

  // Normalize time axis
  const minTs = points[0].ts
  const maxTs = points[points.length - 1].ts
  const tsRange = Math.max(maxTs - minTs, 1)

  // Normalize value axis — enforce a minimum visible range
  const values = points.map((p) => p.pct)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const valRange = Math.max(rawMax - rawMin, 2) // min 2pp so flat-ish lines still render

  const pad = 2
  const drawW = width  - pad * 2
  const drawH = height - pad * 2

  const toXY = (p: OddsPoint) => ({
    x: pad + ((p.ts - minTs) / tsRange) * drawW,
    y: pad + drawH - ((p.pct - rawMin) / valRange) * drawH,
  })

  const coords = points.map(toXY)
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")

  const first = coords[0]
  const last  = coords[coords.length - 1]

  // Closed area path for subtle fill
  const area = `${line} L${last.x.toFixed(1)},${(height - pad).toFixed(1)} L${first.x.toFixed(1)},${(height - pad).toFixed(1)} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden>
      {/* Area fill — very subtle */}
      <path d={area} fill={color} opacity={0.1} />
      {/* Line stroke */}
      <path d={line} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Terminal dot */}
      <circle cx={last.x.toFixed(1)} cy={last.y.toFixed(1)} r={1.8} fill={color} />
    </svg>
  )
}
