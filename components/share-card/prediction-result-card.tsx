"use client"

import { CardFrame, CardHeader, CardFooter } from "./card-frame"
import type { RankKey } from "@/components/user-profile-card"
import type { Persona } from "@/lib/game-engine"
import { RANKS } from "@/components/user-profile-card"

export interface PredictionResultData {
  marketTitle:      string
  category:         string
  side:             "yes" | "no"
  entryOdds?:       number   // yes% at time of bet (0-100)
  won:              boolean
  profit?:          number   // positive = earnings, negative = loss
  amount:           number
  payoutMultiplier?: number
  rank?:            RankKey
  persona?:         Persona
  username:         string
}

function formatCredits(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return Math.abs(v).toLocaleString()
}

const LOSS_LINES = [
  "Wrong this time.",
  "Market got me.",
  "Back tomorrow.",
  "Bold call. Wrong call.",
  "Almost.",
  "The market disagrees.",
]

function pickLossLine(marketTitle: string): string {
  const idx = marketTitle.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % LOSS_LINES.length
  return LOSS_LINES[idx]
}

// ── Win Card ─────────────────────────────────────────────────────────────────

export function WinCard({ data }: { data: PredictionResultData }) {
  const { marketTitle, side, entryOdds, amount, profit = 0, payoutMultiplier, rank, persona, username } = data
  const sideColor    = side === "yes" ? "#22C55E" : "#EF4444"
  const multiplier   = payoutMultiplier ?? (amount > 0 ? Math.round(((amount + profit) / amount) * 10) / 10 : 1)
  const isBigWin     = multiplier >= 2.5
  const rankInfo     = rank ? RANKS[rank] : null

  return (
    <CardFrame accentColor="#22C55E">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-0">
        <span className="font-black tracking-[0.2em] uppercase" style={{ fontSize: 11, color: "#FFFFFF" }}>
          LEDGE
        </span>
        <span
          className="font-black uppercase tracking-wider px-2.5 py-1"
          style={{
            fontSize: 10,
            color: "#22C55E",
            background: "rgba(34,197,94,0.15)",
            border: "1px solid rgba(34,197,94,0.35)",
            borderRadius: 6,
            letterSpacing: "0.12em",
          }}
        >
          ✓ WIN
        </span>
      </div>

      <div className="flex flex-col px-6 pt-5 pb-0 gap-4">

        {/* Market + side */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <p
            className="font-semibold leading-snug mb-3"
            style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", lineHeight: 1.45 }}
          >
            {marketTitle}
          </p>
          <div className="flex items-center gap-2">
            <span
              className="font-bold uppercase tracking-wider px-2 py-0.5"
              style={{
                fontSize: 11,
                color: sideColor,
                background: `${sideColor}18`,
                border: `1px solid ${sideColor}35`,
                borderRadius: 5,
              }}
            >
              {side.toUpperCase()} ↗
            </span>
            {entryOdds !== undefined && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                entered at{" "}
                <span className="font-mono font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {entryOdds}¢
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Hero: multiplier */}
        <div className="flex flex-col items-center gap-0.5 py-3">
          <span
            className="font-black font-mono tabular-nums leading-none"
            style={{
              fontSize: 80,
              background: isBigWin
                ? "linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 50%, #FFFFFF 100%)"
                : "linear-gradient(135deg, #22C55E 0%, #86EFAC 60%, #22C55E 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: isBigWin
                ? "drop-shadow(0 0 20px rgba(255,255,255,0.35))"
                : "drop-shadow(0 0 16px rgba(34,197,94,0.45))",
              lineHeight: 0.9,
            }}
          >
            {multiplier}×
          </span>
          <span
            className="uppercase font-semibold"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.18em" }}
          >
            Payout Multiplier
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }} />

        {/* Staked / Profit row */}
        <div className="flex items-center justify-between pb-2">
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Staked
            </span>
            <span className="font-mono font-bold" style={{ fontSize: 15, color: "rgba(255,255,255,0.45)" }}>
              {formatCredits(amount)} CR
            </span>
          </div>
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.07)" }} />
          <div className="flex flex-col items-end gap-1">
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Profit
            </span>
            <span className="font-mono font-black" style={{ fontSize: 22, color: "#22C55E" }}>
              +{formatCredits(profit)} CR
            </span>
          </div>
        </div>

        {/* Persona + rank row */}
        {(persona || rankInfo) && (
          <>
            <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />
            <div className="flex items-center justify-between pb-2">
              {persona && (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 18 }}>{persona.emoji}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
                    {persona.label}
                  </span>
                </div>
              )}
              {rankInfo && (
                <span
                  className="font-bold uppercase tracking-wider px-2 py-0.5"
                  style={{
                    fontSize: 10,
                    color: rankInfo.color,
                    background: `${rankInfo.color}18`,
                    border: `1px solid ${rankInfo.color}35`,
                    borderRadius: 5,
                  }}
                >
                  {rankInfo.icon} {rankInfo.label}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <CardFooter username={username} />
    </CardFrame>
  )
}

// ── Loss Card ─────────────────────────────────────────────────────────────────

export function LossCard({ data }: { data: PredictionResultData }) {
  const { marketTitle, side, entryOdds, amount, username } = data
  const sideColor   = side === "yes" ? "#22C55E" : "#EF4444"
  const wrongColor  = side === "yes" ? "#EF4444" : "#22C55E"
  const resultSide  = side === "yes" ? "NO" : "YES"
  const quip        = pickLossLine(marketTitle)

  return (
    <CardFrame accentColor="rgba(255,255,255,0.15)">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-0">
        <span className="font-black tracking-[0.2em] uppercase" style={{ fontSize: 11, color: "#FFFFFF" }}>
          LEDGE
        </span>
        <span
          className="font-black uppercase tracking-wider px-2.5 py-1"
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            letterSpacing: "0.12em",
          }}
        >
          ✕ LOSS
        </span>
      </div>

      <div className="flex flex-col px-6 pt-5 pb-0 gap-4">

        {/* Market + side */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <p
            className="font-semibold leading-snug mb-3"
            style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.45 }}
          >
            {marketTitle}
          </p>
          <div className="flex items-center gap-2">
            <span
              className="font-bold uppercase tracking-wider px-2 py-0.5"
              style={{
                fontSize: 11,
                color: sideColor,
                background: `${sideColor}12`,
                border: `1px solid ${sideColor}25`,
                borderRadius: 5,
              }}
            >
              {side.toUpperCase()} ↗
            </span>
            {entryOdds !== undefined && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                entered at{" "}
                <span className="font-mono font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {entryOdds}¢
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Hero: quip text */}
        <div className="flex flex-col items-center gap-2 py-4">
          <span
            className="font-black leading-tight text-center"
            style={{
              fontSize: 32,
              color: "rgba(255,255,255,0.55)",
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
            }}
          >
            {quip}
          </span>
          <span
            className="uppercase font-semibold"
            style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.18em" }}
          >
            Better luck next time
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }} />

        {/* Call vs result */}
        <div className="flex items-center justify-between pb-1">
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Your Call
            </span>
            <span
              className="font-mono font-black uppercase"
              style={{ fontSize: 22, color: sideColor }}
            >
              {side.toUpperCase()}
            </span>
          </div>
          <span style={{ fontSize: 18, color: "rgba(255,255,255,0.15)" }}>→</span>
          <div className="flex flex-col items-end gap-1">
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Result
            </span>
            <span
              className="font-mono font-black uppercase"
              style={{ fontSize: 22, color: wrongColor }}
            >
              {resultSide}
            </span>
          </div>
        </div>

        {/* Amount lost */}
        <div
          className="flex items-center justify-center py-2.5"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
          }}
        >
          <span className="font-mono font-bold" style={{ fontSize: 15, color: "rgba(255,255,255,0.3)" }}>
            −{formatCredits(amount)} CR staked
          </span>
        </div>
      </div>

      <CardFooter username={username} />
    </CardFrame>
  )
}
