"use client"

import { cn } from "@/lib/utils"

// Scan-line + noise SVG data URI — renders as a subtle grain overlay
const NOISE_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E")`

interface CardFrameProps {
  children: React.ReactNode
  /** Accent color for the radial glow — CSS hex */
  accentColor?: string
  /** Second accent for dual-tone gradient (optional) */
  accentColor2?: string
  className?: string
}

export function CardFrame({ children, accentColor = "#F5A623", accentColor2, className }: CardFrameProps) {
  const glow = accentColor2
    ? `radial-gradient(ellipse 80% 60% at 50% 0%, ${accentColor}18 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 100%, ${accentColor2}14 0%, transparent 70%)`
    : `radial-gradient(ellipse 80% 60% at 50% 0%, ${accentColor}1A 0%, transparent 70%)`

  return (
    <div
      className={cn("relative overflow-hidden select-none", className)}
      style={{
        width: 360,
        minHeight: 520,
        background: "#0A0A0B",
        borderRadius: 20,
        border: `1px solid ${accentColor}28`,
      }}
    >
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: glow }} />

      {/* Noise grain */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{ backgroundImage: NOISE_SVG, backgroundRepeat: "repeat", opacity: 0.4 }}
      />

      {/* Scan-line stripe */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px)",
          borderRadius: 20,
        }}
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}

// Shared header bar
export function CardHeader({ label, badge }: { label?: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between px-6 pt-5 pb-0">
      <span
        className="font-black tracking-[0.2em] uppercase"
        style={{ fontSize: 11, color: "#F5A623", letterSpacing: "0.18em" }}
      >
        LEDGE
      </span>
      {badge && (
        <span
          className="font-semibold uppercase tracking-wider"
          style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em" }}
        >
          {badge}
        </span>
      )}
      {label && (
        <span
          className="font-medium uppercase tracking-wider"
          style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}
        >
          {label}
        </span>
      )}
    </div>
  )
}

// Shared footer
export function CardFooter({ username }: { username: string }) {
  return (
    <div
      className="flex items-center justify-between px-6 pb-5"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}
    >
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", letterSpacing: "0.06em" }}>
        ledge.app
      </span>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
        @{username}
      </span>
    </div>
  )
}

// Stat block used across cards
export function StatBlock({ value, label, color = "rgba(255,255,255,0.9)" }: { value: string; label: string; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-black font-mono tabular-nums" style={{ fontSize: 22, color, lineHeight: 1 }}>
        {value}
      </span>
      <span
        className="uppercase tracking-widest font-semibold"
        style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em" }}
      >
        {label}
      </span>
    </div>
  )
}
