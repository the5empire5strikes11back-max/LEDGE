"use client"

import { useState, useCallback, useEffect } from "react"

const KEY = "ledge:ob:v1"

export interface OnboardingState {
  feedTooltipDone: boolean
  firstBetHintDone: boolean
  firstBetAchievementDone: boolean
  streakTipDone: boolean
  rankTipDone: boolean
  whaleTipDone: boolean
  circleTipDone: boolean
  dailyDropClaimed: boolean
  firstMarketCreated: boolean
  notifPromptSeen: boolean
  profileCoachmarkDone: boolean
  circlesCoachmarkDone: boolean
}

const DEFAULTS: OnboardingState = {
  feedTooltipDone: false,
  firstBetHintDone: false,
  firstBetAchievementDone: false,
  streakTipDone: false,
  rankTipDone: false,
  whaleTipDone: false,
  circleTipDone: false,
  dailyDropClaimed: false,
  firstMarketCreated: false,
  notifPromptSeen: false,
  profileCoachmarkDone: false,
  circlesCoachmarkDone: false,
}

function read(): OnboardingState {
  if (typeof window === "undefined") return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(state: OnboardingState): void {
  if (typeof window === "undefined") return
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(DEFAULTS)

  // SSR-safe: read localStorage only on client
  useEffect(() => {
    setState(read())
  }, [])

  const complete = useCallback((key: keyof OnboardingState) => {
    setState((prev) => {
      const next = { ...prev, [key]: true }
      persist(next)
      return next
    })
  }, [])

  const completeAll = useCallback(() => {
    const all = (Object.keys(DEFAULTS) as (keyof OnboardingState)[]).reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {} as OnboardingState
    )
    persist(all)
    setState(all)
  }, [])

  return { state, complete, completeAll }
}
