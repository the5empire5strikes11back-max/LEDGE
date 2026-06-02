"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

// ── Color palette — deterministic per username ──────────────────────────────

const PALETTE = [
  { bg: "#F5A623", fg: "#0A0A0B" },
  { bg: "#3B82F6", fg: "#ffffff" },
  { bg: "#22C55E", fg: "#0A0A0B" },
  { bg: "#8B5CF6", fg: "#ffffff" },
  { bg: "#EC4899", fg: "#ffffff" },
  { bg: "#06B6D4", fg: "#0A0A0B" },
  { bg: "#EF4444", fg: "#ffffff" },
  { bg: "#F97316", fg: "#0A0A0B" },
]

function pickColor(username: string) {
  let h = 0
  for (const c of username) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff
  return PALETTE[h % PALETTE.length]
}

function abbreviate(username: string): string {
  const parts = username.split(/[._\-\s]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (username[0] ?? "?").toUpperCase() + (username[1] ?? "").toUpperCase()
}

// ── UserAvatar ──────────────────────────────────────────────────────────────

export interface UserAvatarProps {
  username: string
  avatarUrl?: string | null
  size?: number
  className?: string
}

export function UserAvatar({ username, avatarUrl, size = 32, className }: UserAvatarProps) {
  const [failed, setFailed] = useState(false)
  const { bg, fg } = pickColor(username || "?")
  const letters = abbreviate(username || "?")

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={username}
        draggable={false}
        className={cn("rounded-full object-cover shrink-0 select-none", className)}
        style={{ width: size, height: size, minWidth: size }}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      aria-label={username}
      className={cn("rounded-full shrink-0 select-none flex items-center justify-center font-mono font-bold", className)}
      style={{
        width: size,
        height: size,
        minWidth: size,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {letters}
    </div>
  )
}

// ── CircleAvatar — gradient fallback with rounded-xl shape ─────────────────

const CIRCLE_GRADIENTS = [
  ["#F5A623", "#EF4444"],
  ["#3B82F6", "#06B6D4"],
  ["#22C55E", "#14B8A6"],
  ["#8B5CF6", "#EC4899"],
  ["#F97316", "#F59E0B"],
  ["#EF4444", "#8B5CF6"],
]

function pickGradient(name: string): [string, string] {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff
  return CIRCLE_GRADIENTS[h % CIRCLE_GRADIENTS.length] as [string, string]
}

export interface CircleAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: number
  className?: string
}

export function CircleAvatar({ name, avatarUrl, size = 40, className }: CircleAvatarProps) {
  const [failed, setFailed] = useState(false)
  const [from, to] = pickGradient(name || "?")
  const initial = (name[0] ?? "?").toUpperCase()

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        draggable={false}
        className={cn("rounded-xl object-cover shrink-0 select-none", className)}
        style={{ width: size, height: size, minWidth: size }}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      aria-label={name}
      className={cn("rounded-xl shrink-0 select-none flex items-center justify-center font-bold text-white", className)}
      style={{
        width: size,
        height: size,
        minWidth: size,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial}
    </div>
  )
}
