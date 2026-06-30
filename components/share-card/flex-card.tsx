"use client"

import { CardFrame, CardHeader, CardFooter } from "./card-frame"
import type { ShareCardData } from "@/app/api/share-cards/route"

interface FlexCardProps {
  bet: NonNullable<ShareCardData['bestBet']>
  username: string
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

export function FlexCard({ bet, username }: FlexCardProps) {
  const isYes = bet.side === "yes"
  const sideColor = isYes ? "#22C55E" : "#EF4444"
  const multiplierIsHigh = bet.payoutMultiplier >= 2.5

  return (
    <CardFrame accentColor={sideColor}>
      <CardHeader badge="✓ CALLED IT" />

      <div className="flex flex-col px-6 pt-6 pb-4 gap-5">

        {/* Market title */}
        <div
          className="w-full flex flex-col gap-3"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            padding: "16px 18px",
          }}
        >
          <p
            className="font-semibold leading-snug"
            style={{ fontSize: 15, color: "rgba(255,255,255,0.9)", lineHeight: 1.4 }}
          >
            {bet.marketTitle}
          </p>

          {/* Side + entry odds */}
          <div className="flex items-center gap-2">
            <span
              className="font-bold uppercase tracking-wider px-2.5 py-1"
              style={{
                fontSize: 11,
                color: sideColor,
                background: `${sideColor}18`,
                border: `1px solid ${sideColor}35`,
                borderRadius: 6,
              }}
            >
              {bet.side.toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              Entered at{" "}
              <span className="font-mono font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
                {bet.entryOdds}¢
              </span>
            </span>
          </div>
        </div>

        {/* Multiplier — hero stat */}
        <div className="flex flex-col items-center gap-1 py-4">
          <span
            className="font-black font-mono tabular-nums leading-none"
            style={{
              fontSize: 72,
              background: multiplierIsHigh
                ? "linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 50%, #FFFFFF 100%)"
                : sideColor,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: multiplierIsHigh ? `drop-shadow(0 0 16px rgba(255,255,255,0.38))` : `drop-shadow(0 0 12px ${sideColor}50)`,
              lineHeight: 0.9,
            }}
          >
            {bet.payoutMultiplier}x
          </span>
          <span
            className="uppercase tracking-[0.2em] font-semibold"
            style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.18em" }}
          >
            Payout Multiplier
          </span>
        </div>

        {/* Divider */}
        <div
          style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
        />

        {/* Profit row */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Staked
            </span>
            <span
              className="font-mono font-bold"
              style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }}
            >
              {formatCredits(bet.amount)} CR
            </span>
          </div>

          <div
            style={{
              width: 1,
              height: 36,
              background: "rgba(255,255,255,0.08)",
            }}
          />

          <div className="flex flex-col items-end gap-1">
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Profit
            </span>
            <span
              className="font-mono font-black"
              style={{ fontSize: 22, color: sideColor }}
            >
              +{formatCredits(bet.profit)} CR
            </span>
          </div>
        </div>

        {/* Call was correct badge */}
        <div
          className="flex items-center justify-center gap-2 py-2.5"
          style={{
            background: `${sideColor}12`,
            border: `1px solid ${sideColor}30`,
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 13 }}>🎯</span>
          <span
            className="font-semibold uppercase tracking-wider"
            style={{ fontSize: 11, color: sideColor, letterSpacing: "0.1em" }}
          >
            {multiplierIsHigh ? "Perfect Call" : "Correct Call"}
          </span>
        </div>
      </div>

      <CardFooter username={username} />
    </CardFrame>
  )
}
