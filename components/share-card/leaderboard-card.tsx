"use client"

import { CardFrame, CardHeader, CardFooter, StatBlock } from "./card-frame"

interface LeaderboardCardProps {
  username: string
  leaderboardRank: number
  credits: number
  winRate: number
  marketsPlayed: number
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

function rankOrdinal(n: number): string {
  if (n === 1) return "1st"
  if (n === 2) return "2nd"
  if (n === 3) return "3rd"
  return `${n}th`
}

function rankLabel(n: number): string {
  if (n === 1) return "🥇 TOP PREDICTOR"
  if (n <= 3) return "🏆 TOP 3"
  if (n <= 10) return "⚡ TOP 10"
  if (n <= 50) return "📈 TOP 50"
  return "RANKED"
}

function rankAccent(n: number): string {
  if (n === 1) return "#FFD700"
  if (n <= 3) return "#F5A623"
  if (n <= 10) return "#3B82F6"
  return "#6B6B7B"
}

export function LeaderboardCard({
  username,
  leaderboardRank,
  credits,
  winRate,
  marketsPlayed,
}: LeaderboardCardProps) {
  const color = rankAccent(leaderboardRank)
  const label = rankLabel(leaderboardRank)
  const isTop3 = leaderboardRank <= 3

  return (
    <CardFrame accentColor={color}>
      <CardHeader badge={label} />

      <div className="flex flex-col items-center px-6 pt-8 pb-4 gap-6">

        {/* Rank number — hero display */}
        <div className="flex flex-col items-center gap-2">
          {/* Position glow ring */}
          <div
            className="flex items-center justify-center"
            style={{
              width: 130,
              height: 130,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
              border: `1.5px solid ${color}${isTop3 ? "60" : "30"}`,
              boxShadow: isTop3 ? `0 0 40px ${color}30, 0 0 80px ${color}15` : undefined,
            }}
          >
            <div className="flex flex-col items-center">
              <span
                className="font-black font-mono tabular-nums leading-none"
                style={{
                  fontSize: leaderboardRank >= 100 ? 40 : 56,
                  lineHeight: 0.9,
                  background: isTop3
                    ? `linear-gradient(135deg, ${color} 0%, #FFF8DC 50%, ${color} 100%)`
                    : color,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: isTop3 ? `drop-shadow(0 0 10px ${color}80)` : undefined,
                }}
              >
                #{leaderboardRank}
              </span>
              <span
                className="uppercase tracking-widest font-semibold"
                style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em" }}
              >
                Global
              </span>
            </div>
          </div>
        </div>

        {/* Ordinal text */}
        <div className="flex flex-col items-center gap-1 text-center">
          <span
            className="font-black uppercase"
            style={{ fontSize: 22, color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em" }}
          >
            {rankOrdinal(leaderboardRank)} Place
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            Global Leaderboard
          </span>
        </div>

        {/* Divider */}
        <div
          className="w-full"
          style={{ height: 1, background: `linear-gradient(90deg, transparent, ${color}25, transparent)` }}
        />

        {/* Stats row */}
        <div className="w-full flex items-center justify-around">
          <StatBlock
            value={formatCredits(credits)}
            label="Credits"
            color={color}
          />
          <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.08)" }} />
          <StatBlock
            value={`${winRate}%`}
            label="Win Rate"
            color={winRate >= 60 ? "#22C55E" : "rgba(255,255,255,0.9)"}
          />
          <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.08)" }} />
          <StatBlock
            value={marketsPlayed.toString()}
            label="Predictions"
          />
        </div>
      </div>

      <CardFooter username={username} />
    </CardFrame>
  )
}
