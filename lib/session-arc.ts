/**
 * Session Arc Engine
 *
 * Tracks the emotional shape of a user's current feed session and returns
 * a phase that drives contextual UI copy and visual energy.
 *
 * Phases (linear progression, one-way except idle reset):
 *   cold     — First 15 seconds. Clean entry, no extra chrome.
 *   browsing — 15 s → 3 min, no bet yet. Normal feed energy.
 *   peaked   — Bet placed this session. Satisfaction + anticipation state.
 *   idle     — 3+ minutes with no bet and no card interaction. Gentle nudge.
 *
 * This is intentionally simple: no persisted state, no server round-trips.
 * The arc resets each time the feed mounts (app reopen / tab refocus).
 */

import { useState, useEffect, useRef, useCallback } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionPhase = "cold" | "browsing" | "peaked" | "idle"

export interface SessionBet {
  marketTitle: string
  marketEndTime: string   // ISO string
  side: "yes" | "no"
}

export interface SessionArcState {
  phase: SessionPhase
  secondsOnFeed: number
  betsThisSession: number
  /** Most recent bet placed in this session */
  lastBet: SessionBet | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Seconds before "cold" transitions to "browsing" */
const COLD_DURATION_S = 15

/** Seconds before "browsing" transitions to "idle" (if no bet + no interaction) */
const IDLE_THRESHOLD_S = 180   // 3 minutes

/** Recording a card interaction (click/hover) resets the idle clock */
const INTERACTION_RESET_S = IDLE_THRESHOLD_S

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseSessionArcReturn {
  arc: SessionArcState
  /** Call when a bet is confirmed (server returned success) */
  recordBet: (marketTitle: string, marketEndTime: string, side: "yes" | "no") => void
  /** Call when user interacts with a card — resets idle clock */
  recordInteraction: () => void
}

export function useSessionArc(): UseSessionArcReturn {
  const [seconds, setSeconds] = useState(0)
  const [bets, setBets] = useState<SessionBet[]>([])
  const lastInteractionRef = useRef<number>(Date.now())

  // Tick every 5 seconds — granularity is enough for phase transitions
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => s + 5)
    }, 5_000)
    return () => clearInterval(id)
  }, [])

  const recordBet = useCallback(
    (marketTitle: string, marketEndTime: string, side: "yes" | "no") => {
      setBets((prev) => [...prev, { marketTitle, marketEndTime, side }])
    },
    []
  )

  const recordInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now()
  }, [])

  // ── Phase derivation ───────────────────────────────────────────────────────
  const phase: SessionPhase = (() => {
    // Peaked: any bet placed this session — this state persists until remount
    if (bets.length > 0) return "peaked"

    // Cold: first 15 seconds
    if (seconds < COLD_DURATION_S) return "cold"

    // Idle: 3+ minutes since last interaction with no bet
    const secondsSinceInteraction = (Date.now() - lastInteractionRef.current) / 1_000
    if (secondsSinceInteraction >= IDLE_THRESHOLD_S) return "idle"

    return "browsing"
  })()

  const arc: SessionArcState = {
    phase,
    secondsOnFeed: seconds,
    betsThisSession: bets.length,
    lastBet: bets[bets.length - 1] ?? null,
  }

  return { arc, recordBet, recordInteraction }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format time until a market closes — used in the arc strip copy.
 * Returns a short human string like "closes in 4h" or "closes tonight".
 */
export function formatCloseTime(endTimeIso: string): string {
  const ms = new Date(endTimeIso).getTime() - Date.now()
  if (ms <= 0) return "closing now"
  const mins  = Math.floor(ms / 60_000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days >= 2) return `closes in ${days}d`
  if (hours >= 18) return "closes tomorrow"
  if (hours >= 6) return "closes tonight"
  if (hours >= 1) return `closes in ${hours}h`
  return `closes in ${mins}m`
}
