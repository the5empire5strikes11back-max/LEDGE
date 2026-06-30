"use client"

import { CardFrame, CardHeader, CardFooter } from "./card-frame"
import type { RankKey } from "@/components/user-profile-card"

const RANK_THEMES: Record<RankKey, {
  label: string
  icon: string
  accent: string
  accent2?: string
  textGradient?: string
  description: string
}> = {
  rookie: {
    label: "Rookie",
    icon: "◆",
    accent: "#6B6B7B",
    description: "Every legend starts somewhere.",
  },
  forecaster: {
    label: "Forecaster",
    icon: "◈",
    accent: "#3B82F6",
    description: "You're reading signals others miss.",
  },
  analyst: {
    label: "Analyst",
    icon: "❖",
    accent: "#A855F7",
    description: "Data before emotion. Always.",
  },
  oracle: {
    label: "Oracle",
    icon: "✦",
    accent: "#FFFFFF",
    description: "You see what others can't.",
  },
  marketMaker: {
    label: "Market Maker",
    icon: "✧",
    accent: "#FFFFFF",
    accent2: "#E2E8F0",
    textGradient: "linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 50%, #FFFFFF 100%)",
    description: "The market bends to your conviction.",
  },
  juryLead: {
    label: "Jury Lead",
    icon: "★",
    accent: "#E2E8F0",
    accent2: "#FFFFFF",
    textGradient: "linear-gradient(135deg, #E2E8F0 0%, #FFFFFF 50%, #E2E8F0 100%)",
    description: "The highest court of prediction.",
  },
}

interface RankCardProps {
  rank: RankKey
  xp: number
  username: string
  xpToNext?: number
  nextRank?: RankKey | null
}

export function RankCard({ rank, xp, username, xpToNext, nextRank }: RankCardProps) {
  const theme = RANK_THEMES[rank]
  const isElite = rank === "marketMaker" || rank === "juryLead"

  const progressPct =
    xpToNext && nextRank
      ? Math.min(100, Math.round(((xp - getThreshold(rank)) / (getThreshold(nextRank) - getThreshold(rank))) * 100))
      : 100

  return (
    <CardFrame accentColor={theme.accent} accentColor2={theme.accent2}>
      <CardHeader badge="RANK ACHIEVED" />

      <div className="flex flex-col items-center px-6 pt-8 pb-4 gap-6">

        {/* Icon display */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: isElite
              ? `radial-gradient(circle, ${theme.accent}28 0%, transparent 70%)`
              : `${theme.accent}12`,
            border: isElite ? `1.5px solid ${theme.accent}50` : `1px solid ${theme.accent}30`,
            boxShadow: isElite
              ? `0 0 60px ${theme.accent}35, 0 0 20px ${theme.accent}25, inset 0 0 30px ${theme.accent}10`
              : `0 0 24px ${theme.accent}20`,
          }}
        >
          <span
            style={{
              fontSize: 56,
              lineHeight: 1,
              background: theme.textGradient ?? theme.accent,
              WebkitBackgroundClip: theme.textGradient ? "text" : undefined,
              WebkitTextFillColor: theme.textGradient ? "transparent" : undefined,
              color: theme.textGradient ? undefined : theme.accent,
              filter: isElite ? `drop-shadow(0 0 8px ${theme.accent}80)` : undefined,
            }}
          >
            {theme.icon}
          </span>
        </div>

        {/* Small "you've reached" label */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span
            className="uppercase tracking-[0.2em] font-medium"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}
          >
            You&apos;ve Reached
          </span>

          {/* Rank name */}
          <span
            className="font-black uppercase"
            style={{
              fontSize: 32,
              letterSpacing: "0.05em",
              lineHeight: 1,
              background: theme.textGradient ?? undefined,
              WebkitBackgroundClip: theme.textGradient ? "text" : undefined,
              WebkitTextFillColor: theme.textGradient ? "transparent" : undefined,
              color: theme.textGradient ? undefined : theme.accent,
              filter: isElite ? `drop-shadow(0 0 12px ${theme.accent}60)` : undefined,
            }}
          >
            {theme.label}
          </span>

          <span
            className="text-center leading-relaxed"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", maxWidth: 240 }}
          >
            {theme.description}
          </span>
        </div>

        {/* XP display */}
        <div
          className="w-full flex flex-col gap-3 px-2"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            padding: "16px 20px",
          }}
        >
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Total XP
            </span>
            <span
              className="font-black font-mono tabular-nums"
              style={{ fontSize: 20, color: theme.accent }}
            >
              {xp.toLocaleString()}
            </span>
          </div>

          {nextRank && (
            <>
              {/* Progress bar */}
              <div
                className="w-full overflow-hidden"
                style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 99 }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressPct}%`,
                    background: theme.textGradient ?? theme.accent,
                    borderRadius: 99,
                    transition: "width 1s ease",
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                  {progressPct}% to {RANK_THEMES[nextRank].label}
                </span>
                {xpToNext && (
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>
                    {xpToNext.toLocaleString()} XP away
                  </span>
                )}
              </div>
            </>
          )}

          {!nextRank && (
            <span
              className="text-center font-semibold uppercase tracking-widest"
              style={{ fontSize: 11, color: theme.accent }}
            >
              ★ Maximum Rank ★
            </span>
          )}
        </div>
      </div>

      <CardFooter username={username} />
    </CardFrame>
  )
}

function getThreshold(rank: RankKey): number {
  const thresholds: Record<RankKey, number> = {
    rookie: 0, forecaster: 500, analyst: 1500, oracle: 4000, marketMaker: 10000, juryLead: 25000,
  }
  return thresholds[rank]
}
