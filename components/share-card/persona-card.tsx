"use client"

import { CardFrame, CardHeader, CardFooter, StatBlock } from "./card-frame"
import type { Persona } from "@/lib/game-engine"

// Persona → accent color (for the glow treatment)
const PERSONA_COLORS: Record<string, { accent: string; accent2?: string; rarity: string; rarityColor: string }> = {
  oracle:          { accent: "#F5A623", accent2: "#FFD700", rarity: "LEGENDARY",  rarityColor: "#F5A623" },
  contrarian:      { accent: "#A855F7", accent2: "#EC4899", rarity: "EPIC",       rarityColor: "#A855F7" },
  sportsSavant:    { accent: "#3B82F6", accent2: "#06B6D4", rarity: "RARE",       rarityColor: "#3B82F6" },
  politicalAnalyst:{ accent: "#10B981", accent2: "#06B6D4", rarity: "RARE",       rarityColor: "#10B981" },
  optimist:        { accent: "#F59E0B", rarity: "COMMON",    rarityColor: "#6B6B7B" },
  pessimist:       { accent: "#6B6B7B", rarity: "COMMON",    rarityColor: "#6B6B7B" },
  analyst:         { accent: "#3B82F6", rarity: "COMMON",    rarityColor: "#3B82F6" },
  newcomer:        { accent: "#6B6B7B", rarity: "COMMON",    rarityColor: "#6B6B7B" },
}

interface PersonaCardProps {
  persona: Persona
  username: string
  winRate: number
  marketsPlayed: number
  crowdAgainstPct: number
}

export function PersonaCard({ persona, username, winRate, marketsPlayed, crowdAgainstPct }: PersonaCardProps) {
  const theme = PERSONA_COLORS[persona.id] ?? PERSONA_COLORS.analyst

  return (
    <CardFrame accentColor={theme.accent} accentColor2={theme.accent2}>
      <CardHeader badge={`${theme.rarity} PERSONA`} />

      {/* Center zone */}
      <div className="flex flex-col items-center px-6 py-8 gap-5">
        {/* Rarity ring around emoji */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${theme.accent}22 0%, transparent 70%)`,
            border: `1.5px solid ${theme.accent}40`,
            boxShadow: `0 0 32px ${theme.accent}30, 0 0 8px ${theme.accent}20`,
          }}
        >
          <span style={{ fontSize: 52 }} role="img" aria-label={persona.label}>
            {persona.emoji}
          </span>
        </div>

        {/* Persona name */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span
            className="font-black uppercase tracking-wider"
            style={{ fontSize: 24, color: "#ffffff", letterSpacing: "0.06em", lineHeight: 1.1 }}
          >
            {persona.label}
          </span>
          <span
            className="text-center leading-relaxed"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", maxWidth: 240 }}
          >
            {persona.description}
          </span>
        </div>

        {/* Divider */}
        <div
          className="w-full"
          style={{ height: 1, background: `linear-gradient(90deg, transparent, ${theme.accent}30, transparent)` }}
        />

        {/* Stats row */}
        <div className="w-full flex items-center justify-around">
          <StatBlock
            value={`${winRate}%`}
            label="Win Rate"
            color={winRate >= 60 ? "#22C55E" : winRate >= 45 ? "#ffffff" : "#EF4444"}
          />
          <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.08)" }} />
          <StatBlock value={marketsPlayed.toString()} label="Predictions" />
          <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.08)" }} />
          <StatBlock
            value={`${crowdAgainstPct}%`}
            label="vs Crowd"
            color={crowdAgainstPct >= 50 ? "#A855F7" : "rgba(255,255,255,0.9)"}
          />
        </div>

        {/* Rarity badge */}
        <div
          className="flex items-center gap-2 px-4 py-1.5"
          style={{
            background: `${theme.rarityColor}18`,
            border: `1px solid ${theme.rarityColor}35`,
            borderRadius: 99,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: theme.rarityColor,
              boxShadow: `0 0 6px ${theme.rarityColor}`,
            }}
          />
          <span
            className="font-bold uppercase tracking-widest"
            style={{ fontSize: 10, color: theme.rarityColor, letterSpacing: "0.14em" }}
          >
            {theme.rarity}
          </span>
        </div>
      </div>

      <CardFooter username={username} />
    </CardFrame>
  )
}
