"use client"

import { ResponsiveContainer, LineChart, Line, Tooltip, ReferenceLine } from "recharts"

interface SparklinePoint {
  credits: number
  created_at: string
}

interface SparklineProps {
  data: SparklinePoint[]
  /** Starting baseline to show gain/loss relative to first snapshot */
  baseline?: number
}

function formatCR(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

export function Sparkline({ data, baseline }: SparklineProps) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
        Not enough data yet — check back tomorrow
      </div>
    )
  }

  const start = baseline ?? data[0].credits
  const end = data[data.length - 1].credits
  const isPositive = end >= start
  const strokeColor = isPositive ? "var(--color-success, #22c55e)" : "var(--color-danger, #ef4444)"

  const chartData = data.map((d) => ({
    credits: d.credits,
    date: new Date(d.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }))

  return (
    <div className="w-full h-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <ReferenceLine y={start} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{
              background: "var(--color-card, #1a1a1f)",
              border: "1px solid var(--color-border, #2a2a32)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "var(--color-foreground)",
              padding: "4px 8px",
            }}
            formatter={(value: number) => [`${formatCR(value)} CR`, ""]}
            labelStyle={{ color: "var(--color-muted-foreground)", marginBottom: 2 }}
          />
          <Line
            type="monotone"
            dataKey="credits"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: strokeColor, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
