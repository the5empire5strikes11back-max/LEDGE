"use client"

import { CardFrame, CardHeader, CardFooter } from "./card-frame"

interface StreakCardProps {
  currentStreak: number
  bestStreak: number
  username: string
}

// Generate dot grid — last N days (filled vs empty based on streak)
function StreakDots({ current, total = 14 }: { current: number; total?: number }) {
  const dots = Array.from({ length: total }, (_, i) => i < current)

  return (
    <div className="flex flex-wrap justify-center gap-2" style={{ maxWidth: 280 }}>
      {dots.map((filled, i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: filled
              ? i < current - 1
                ? "#E2E8F0"
                : "#FFFFFF"
              : "rgba(255,255,255,0.08)",
            boxShadow: filled ? `0 0 ${i === current - 1 ? 10 : 4}px ${i === current - 1 ? "#FFFFFF" : "rgba(255,255,255,0.38)"}` : undefined,
            transition: "background 0.3s ease",
          }}
        />
      ))}
    </div>
  )
}

function streakLabel(n: number): string {
  if (n >= 30) return "LEGENDARY STREAK 🔮"
  if (n >= 14) return "ON FIRE 🔥"
  if (n >= 7) return "WEEKLY WARRIOR"
  if (n >= 3) return "BUILDING MOMENTUM"
  return "KEEP GOING"
}

function streakColor(n: number): string {
  if (n >= 30) return "#FFFFFF"
  if (n >= 14) return "#FFFFFF"
  if (n >= 7) return "#E2E8F0"
  return "#E2E8F0"
}

export function StreakCard({ currentStreak, bestStreak, username }: StreakCardProps) {
  const color = streakColor(currentStreak)
  const label = streakLabel(currentStreak)
  const isRecord = currentStreak >= bestStreak && bestStreak > 0

  return (
    <CardFrame accentColor={color}>
      <CardHeader badge={label} />

      <div className="flex flex-col items-center px-6 pt-8 pb-4 gap-6">

        {/* Big streak number */}
        <div className="flex flex-col items-center gap-0">
          <span
            className="font-black font-mono tabular-nums leading-none"
            style={{
              fontSize: 96,
              lineHeight: 0.85,
              background: `linear-gradient(180deg, #FFFFFF 0%, ${color} 100%)`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: `drop-shadow(0 0 24px ${color}60)`,
            }}
          >
            {currentStreak}
          </span>
          <span
            className="uppercase tracking-[0.25em] font-bold"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", letterSpacing: "0.22em" }}
          >
            Day Streak
          </span>
        </div>

        {/* New record badge */}
        {isRecord && (
          <div
            className="flex items-center gap-2 px-4 py-1.5"
            style={{
              background: `${color}18`,
              border: `1px solid ${color}40`,
              borderRadius: 99,
            }}
          >
            <span style={{ fontSize: 12 }}>🏆</span>
            <span
              className="font-bold uppercase tracking-wider"
              style={{ fontSize: 10, color, letterSpacing: "0.12em" }}
            >
              Personal Record
            </span>
          </div>
        )}

        {/* Dot grid */}
        <StreakDots current={Math.min(currentStreak, 14)} total={14} />

        {/* Divider */}
        <div
          className="w-full"
          style={{ height: 1, background: `linear-gradient(90deg, transparent, ${color}25, transparent)` }}
        />

        {/* Stats row */}
        <div className="w-full flex items-center justify-around">
          <div className="flex flex-col items-center gap-1">
            <span
              className="font-black font-mono tabular-nums"
              style={{ fontSize: 22, color: "rgba(255,255,255,0.9)" }}
            >
              {currentStreak}
            </span>
            <span
              className="uppercase tracking-widest font-semibold"
              style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em" }}
            >
              Current
            </span>
          </div>

          <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.08)" }} />

          <div className="flex flex-col items-center gap-1">
            <span
              className="font-black font-mono tabular-nums"
              style={{ fontSize: 22, color }}
            >
              {bestStreak}
            </span>
            <span
              className="uppercase tracking-widest font-semibold"
              style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em" }}
            >
              Best Ever
            </span>
          </div>
        </div>
      </div>

      <CardFooter username={username} />
    </CardFrame>
  )
}
