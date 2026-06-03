"use client"

import { useState, useEffect, useCallback } from "react"
import { TrendingUp, Users, User, Zap } from "lucide-react"
import { toast, Toaster } from "sonner"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { DailyDropModal } from "@/components/daily-drop-modal"
import { RankUpModal } from "@/components/rank-up-modal"
import { WinReceiptModal } from "@/components/win-receipt-modal"
import { MysteryChestModal } from "@/components/mystery-chest-modal"
import { FeedScreen } from "@/components/screens/feed-screen"
import { CirclesScreen } from "@/components/screens/circles-screen"
import { ProfileScreen } from "@/components/screens/profile-screen"
import { Ticker } from "@/components/ui/ticker"
import { UserAvatar } from "@/components/ui/user-avatar"
import { FirstBetAchievement } from "@/components/onboarding/achievement-toast"
import { ProgressiveTip } from "@/components/onboarding/progressive-tip"
import { useOnboarding } from "@/lib/onboarding"
import {
  rankFromXP,
  calculatePersona,
  vetoesFromStreak,
  decayLevel,
  type ChestTier,
} from "@/lib/game-engine"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import type { BetRecord } from "@/lib/game-engine"
import type { Database } from "@/types/database"

type Screen = "feed" | "circles" | "profile"

const NAV_ITEMS: { id: Screen; label: string; icon: React.ElementType }[] = [
  { id: "feed",    label: "Feed",    icon: TrendingUp },
  { id: "circles", label: "Circles", icon: Users },
  { id: "profile", label: "Profile", icon: User },
]

// LocalStorage keys for activity tracking
const LS_LAST_CIRCLES_VISIT = "ledge_last_circles_visit"
const LS_HAS_CIRCLES        = "ledge_has_circles"
const LS_LAST_APP_OPEN      = "ledge_last_app_open"

interface WinReceiptData {
  market: { title: string; category: string }
  bet: { side: "yes" | "no"; amount: number }
  payout: number
  profit: number
  xpGained: number
}

type Profile = Database['public']['Tables']['profiles']['Row']

function formatResolveTime(endTime: string): string {
  const ms = new Date(endTime).getTime() - Date.now()
  if (ms <= 0) return "closing soon"
  const mins  = Math.floor(ms / 60_000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days >= 1)  return `closes in ${days}d`
  if (hours >= 1) return `closes in ${hours}h`
  return `closes in ${mins}m`
}

// ── Logo mark ─────────────────────────────────────────────────────────────────
function LedgeLogo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: size, height: size, borderRadius: "var(--radius-badge)", flexShrink: 0 }}>
      <rect width="100" height="100" rx="18" fill="#0A0A0B"/>
      <rect x="22" y="14" width="56" height="18" fill="#F5A623"/>
      <rect x="22" y="14" width="18" height="72" fill="#F5A623"/>
    </svg>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("feed")
  const [returnHookCount, setReturnHookCount] = useState(0)
  const [circlesBadge, setCirclesBadge] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [betHistory, setBetHistory] = useState<BetRecord[]>([])
  const [dailyDropOpen, setDailyDropOpen] = useState(false)
  const [pendingDailyDrop, setPendingDailyDrop] = useState(false)
  const { state: ob, complete: completeOb } = useOnboarding()
  const [showFirstBetAchievement, setShowFirstBetAchievement] = useState(false)
  const [dailyDropData, setDailyDropData] = useState<{
    dropAmount: number; streakBonus: number; multiplier: number
    chestTier: ChestTier | null; chestCredits: number; newStreak: number
  } | null>(null)
  const [winReceipt, setWinReceipt] = useState<WinReceiptData | null>(null)
  const [rankUpFrom, setRankUpFrom] = useState<RankKey | null>(null)
  const [chestOpen, setChestOpen] = useState(false)
  const supabase = createClient()

  const credits  = profile?.credits ?? 0
  const xp       = profile?.xp ?? 0
  const streak   = profile?.streak ?? 0
  const isPlus   = profile?.is_plus ?? false
  const rank     = profile ? rankFromXP(xp) : "rookie" as RankKey
  const persona  = calculatePersona(betHistory)
  const vetoes   = vetoesFromStreak(streak, isPlus)
  const rankConfig = RANKS[rank]

  const daysSinceActive = profile
    ? Math.floor((Date.now() - new Date(profile.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0
  const decay = decayLevel(daysSinceActive)

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/user')
      if (res.status === 401) { window.location.href = '/auth/login'; return }
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        const prevRank = rankFromXP(data.xp - 60)
        const newRank  = rankFromXP(data.xp)
        if (prevRank !== newRank) setRankUpFrom(prevRank)
      } else {
        window.location.href = '/auth/login'
      }
    } catch {
      setTimeout(loadProfile, 3000)
    }
  }, [])

  const loadBetHistory = useCallback(async () => {
    const res = await fetch('/api/bets')
    if (res.ok) {
      const bets = await res.json()
      const records: BetRecord[] = bets.map((b: { markets: { category: string }; side: string; won: boolean }) => ({
        category: b.markets?.category ?? 'Sports',
        side: b.side,
        majorityWas: b.side,
        won: b.won ?? false,
      }))
      setBetHistory(records)
    }
  }, [])

  const checkDailyDrop = useCallback(async () => {
    const res = await fetch('/api/daily-drop')
    if (res.ok) {
      const { claimed } = await res.json()
      if (!claimed) {
        if (ob.firstBetAchievementDone) {
          // Returning user — show normally after a short delay
          setTimeout(() => setDailyDropOpen(true), 800)
        } else {
          // New user — defer until after first bet so it doesn't interrupt discovery
          setPendingDailyDrop(true)
        }
      }
    }
  }, [ob.firstBetAchievementDone])

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("ledge_accent")
    if (saved) {
      const ACCENT_FG: Record<string, string> = {
        "#F5A623": "#0A0A0B", "#3B82F6": "#ffffff", "#22C55E": "#0A0A0B",
        "#8B5CF6": "#ffffff", "#EF4444": "#ffffff", "#EC4899": "#ffffff",
        "#06B6D4": "#0A0A0B", "#E2E8F0": "#0A0A0B",
      }
      const fg = ACCENT_FG[saved] ?? "#0A0A0B"
      document.documentElement.style.setProperty("--accent", saved)
      document.documentElement.style.setProperty("--accent-foreground", fg)
      document.documentElement.style.setProperty("--primary", saved)
      document.documentElement.style.setProperty("--ring", saved)
    }
  }, [])

  // Fetch return hooks count for nav badge + welcome-back toast
  useEffect(() => {
    if (!ob.firstBetAchievementDone) return
    fetch('/api/return-hooks')
      .then((r) => r.ok ? r.json() : [])
      .then((hooks: unknown[]) => {
        setReturnHookCount(hooks.length)
        // Welcome-back toast when returning after >4h with bets in play
        if (hooks.length > 0) {
          const last = Number(localStorage.getItem(LS_LAST_APP_OPEN) ?? 0)
          const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000
          if (last < fourHoursAgo) {
            toast(`${hooks.length} bet${hooks.length > 1 ? 's' : ''} still in play`, {
              description: 'Welcome back — check your predictions',
              duration: 4000,
            })
          }
        }
        localStorage.setItem(LS_LAST_APP_OPEN, String(Date.now()))
      })
      .catch(() => {})
  }, [ob.firstBetAchievementDone])

  // Circles activity badge — show dot if user has circles and hasn't visited in 8h
  useEffect(() => {
    const hasCircles = localStorage.getItem(LS_HAS_CIRCLES) === 'true'
    if (!hasCircles) return
    const last = Number(localStorage.getItem(LS_LAST_CIRCLES_VISIT) ?? 0)
    const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000
    if (last < eightHoursAgo) setCirclesBadge(true)
  }, [])

  const handleScreenChange = (s: Screen) => {
    setScreen(s)
    if (s === 'circles') {
      setCirclesBadge(false)
      localStorage.setItem(LS_LAST_CIRCLES_VISIT, String(Date.now()))
    }
  }

  useEffect(() => {
    loadProfile()
    loadBetHistory()
    checkDailyDrop()
  }, [loadProfile, loadBetHistory, checkDailyDrop])

  const handleDailyDropClose = async () => {
    setDailyDropOpen(false)
    const res = await fetch('/api/daily-drop', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setDailyDropData(data)
      setProfile(data.profile)
      if (data.chestTier) setTimeout(() => setChestOpen(true), 600)
      // Show streak progressive tip on first active streak
      if (!ob.streakTipDone && data.profile?.streak >= 2) {
        setTimeout(() => completeOb("streakTipDone"), 5000) // auto-dismiss after 5s of showing
      }
    }
  }

  const handleBet = async (
    marketTitle: string,
    marketCategory: string,
    side: "yes" | "no",
    amount: number,
    _yesPercent: number,
    majorityWas: "yes" | "no",
    serverCredits?: number,
    serverXp?: number,
    marketEndTime?: string,
  ) => {
    setProfile((prev) => {
      if (!prev) return prev
      return { ...prev, credits: serverCredits ?? prev.credits - amount, xp: serverXp ?? prev.xp + 10 }
    })

    if (serverCredits === undefined) {
      // First-bet achievement
      if (!ob.firstBetAchievementDone) {
        completeOb("firstBetAchievementDone")
        completeOb("firstBetHintDone")
        setShowFirstBetAchievement(true)
        // Trigger the daily drop that was deferred past first-load
        if (pendingDailyDrop) {
          setPendingDailyDrop(false)
          setTimeout(() => setDailyDropOpen(true), 3000)
        }
      } else {
        const resolveHint = marketEndTime ? formatResolveTime(marketEndTime) : null
        toast(`+10 XP · ${side.toUpperCase()}`, {
          description: resolveHint ?? "Bet placed — check back when it resolves",
          duration: 3000,
          style: {
            background: "var(--accent)", color: "var(--accent-foreground)",
            border: "none", fontSize: "13px", fontWeight: "700",
          },
        })
      }

      const newRecord: BetRecord = { category: marketCategory as BetRecord["category"], side, majorityWas, won: false }
      setBetHistory((prev) => [...prev, newRecord])

      if (profile) {
        const prevRank = rankFromXP(profile.xp)
        const newRank  = rankFromXP(profile.xp + 10)
        if (prevRank !== newRank) setRankUpFrom(prevRank)
      }
    }
  }

  const handleWin = (
    marketTitle: string,
    marketCategory: string,
    bet: { side: "yes" | "no"; amount: number },
    payout: number
  ) => {
    const profit   = payout - bet.amount
    const xpGained = 60
    setProfile((prev) => prev ? { ...prev, credits: prev.credits + payout, xp: prev.xp + xpGained } : prev)
    setBetHistory((prev) => {
      const updated = [...prev]
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].category === marketCategory && !updated[i].won) {
          updated[i] = { ...updated[i], won: true }
          break
        }
      }
      return updated
    })
    if (profile) {
      const prevRank = rankFromXP(profile.xp)
      const newRank  = rankFromXP(profile.xp + xpGained)
      if (prevRank !== newRank) setRankUpFrom(prevRank)
    }
    setWinReceipt({ market: { title: marketTitle, category: marketCategory }, bet, payout, profit, xpGained })
    toast(`+${xpGained} XP 🎉`, {
      description: `+${profit.toLocaleString()} CR profit`,
      duration: 3500,
      style: { background: "var(--color-success, #22c55e)", color: "#0A0A0B", border: "none", fontSize: "14px", fontWeight: "800" },
    })
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Loading</span>
        </div>
      </div>
    )
  }

  // ── Screens shared props ──────────────────────────────────────────────────
  const screenContent = (
    <>
      {screen === "feed" && (
        <FeedScreen
          availableCredits={credits}
          streak={streak}
          decay={decay}
          onBet={handleBet}
          onWin={handleWin}
        />
      )}
      {screen === "circles" && (
        <CirclesScreen availableCredits={credits} onBet={handleBet} />
      )}
      {screen === "profile" && (
        <ProfileScreen
          xp={xp} rank={rank} credits={credits} streak={streak}
          vetoes={vetoes} persona={persona} decay={decay}
          username={profile.username}
          avatarUrl={(profile as { avatar_url?: string }).avatar_url ?? null}
          isPlus={isPlus}
        />
      )}
    </>
  )

  return (
    <div className="h-screen overflow-hidden bg-background flex">

      {/* ── DESKTOP: Left Sidebar ─────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 w-[220px] border-r border-border bg-background">

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-[57px] border-b border-border shrink-0">
          <LedgeLogo size={28} />
          <span className="font-bold text-base tracking-tight">Ledge</span>
          {decay !== "none" && (
            <div className={cn(
              "ml-auto w-1.5 h-1.5 rounded-full animate-pulse shrink-0",
              decay === "critical" ? "bg-danger" : "bg-accent"
            )} />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const feedBadge = id === 'feed' && returnHookCount > 0
            const circlesBadgeShow = id === 'circles' && circlesBadge
            return (
            <button
              key={id}
              onClick={() => handleScreenChange(id)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 text-left w-full",
                screen === id
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <Icon className={cn(
                "w-4 h-4 shrink-0 transition-all duration-150",
                screen === id && "drop-shadow-[0_0_6px_rgba(245,166,35,0.7)]"
              )} />
              {label}
              <span className="ml-auto flex items-center gap-1">
                {id === "feed" && screen === id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                )}
                {feedBadge && screen !== id && (
                  <span className="min-w-[16px] h-4 px-1 bg-accent text-accent-foreground text-[9px] font-bold rounded-full flex items-center justify-center tabular-nums">
                    {returnHookCount}
                  </span>
                )}
                {circlesBadgeShow && (
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                )}
              </span>
            </button>
            )
          })}

          {/* Live indicator strip */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Zap className="w-3 h-3 text-accent/60" />
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">Live Markets</span>
            </div>
          </div>
        </nav>

        {/* Bottom user section */}
        <div className="shrink-0 border-t border-border px-3 py-4 flex flex-col gap-3">
          {/* Decay warning */}
          {decay !== "none" && (
            <div className={cn(
              "px-3 py-2 text-[11px] font-medium",
              decay === "critical"
                ? "bg-danger/8 border border-danger/25 text-danger"
                : "bg-accent/8 border border-accent/20 text-accent"
            )} style={{ borderRadius: "var(--radius-button)" }}>
              {decay === "critical" ? "⚠ Rank decaying" : "🔥 Streak at risk"}
            </div>
          )}

          {/* User card */}
          <button
            onClick={() => handleScreenChange("profile")}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 transition-all duration-150 text-left w-full border",
              screen === "profile"
                ? "bg-accent/10 border-accent/20"
                : "bg-secondary border-transparent hover:border-border"
            )}
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <UserAvatar
              username={profile.username}
              avatarUrl={(profile as { avatar_url?: string }).avatar_url}
              size={28}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">@{profile.username}</p>
              <p className={cn("text-[10px] font-semibold", rankConfig.color)}>
                {rankConfig.icon} {rankConfig.label}
              </p>
            </div>
          </button>

          {/* Credits */}
          <div
            className="flex items-center justify-between px-3 py-2 bg-surface border border-border"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Credits</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm font-bold text-accent tabular-nums">
                <Ticker value={credits} decimals={0} />
              </span>
              <span className="text-[10px] text-muted-foreground">CR</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MOBILE: Top Header ───────────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-background border-b border-border px-4 h-[57px] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <LedgeLogo size={28} />
          <span className="font-semibold text-base tracking-tight">Ledge</span>
        </div>

        {decay !== "none" && (
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", decay === "critical" ? "bg-danger" : "bg-accent")} />
            <span className={cn("text-[10px] font-medium uppercase tracking-wider", decay === "critical" ? "text-danger" : "text-accent")}>
              {decay === "critical" ? "Rank Decaying" : "Streak at risk"}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border" style={{ borderRadius: "var(--radius-button)" }}>
          <span className="font-mono text-sm font-semibold tabular-nums text-accent">
            <Ticker value={credits} decimals={0} />
          </span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">CR</span>
        </div>
      </header>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-[220px] flex flex-col">
        {/* Mobile top padding */}
        <div className="lg:hidden h-[57px] shrink-0" />

        {/* Screen */}
        <main className="flex-1 flex flex-col overflow-hidden pb-[65px] lg:pb-0">
          {screenContent}
        </main>

        {/* Mobile bottom padding */}
        <div className="lg:hidden h-[65px] shrink-0" />
      </div>

      {/* ── MOBILE: Bottom Navigation ─────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-background border-t border-border">
        <div className="flex">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const feedBadge  = id === 'feed'    && returnHookCount > 0 && screen !== id
            const circBadge  = id === 'circles' && circlesBadge
            return (
            <button
              key={id}
              onClick={() => handleScreenChange(id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors duration-200 relative",
                screen === id ? "text-accent" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className={cn("w-5 h-5 transition-all duration-200", screen === id && "drop-shadow-[0_0_6px_rgba(245,166,35,0.6)]")} />
                {feedBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-3.5 px-0.5 bg-accent text-accent-foreground text-[8px] font-bold rounded-full flex items-center justify-center tabular-nums leading-none">
                    {returnHookCount}
                  </span>
                )}
                {circBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border border-background" />
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
            </button>
            )
          })}
        </div>
      </nav>

      {/* ── Modals (shared across both layouts) ───────────────────────────── */}
      <DailyDropModal
        open={dailyDropOpen}
        onClose={handleDailyDropClose}
        baseAmount={500}
        rank={rank}
        rankMultiplier={dailyDropData?.multiplier ?? 1}
        streakDays={streak}
        streakBonus={dailyDropData?.streakBonus ?? 0}
        currentBalance={credits}
      />
      <WinReceiptModal
        open={!!winReceipt}
        onClose={() => setWinReceipt(null)}
        market={winReceipt?.market ?? { title: "", category: "" }}
        bet={winReceipt?.bet ?? { side: "yes", amount: 0 }}
        payout={winReceipt?.payout ?? 0}
        profit={winReceipt?.profit ?? 0}
        newXP={xp}
        xpGained={winReceipt?.xpGained ?? 0}
        username={profile.username}
      />
      <RankUpModal
        open={!!rankUpFrom}
        onClose={() => setRankUpFrom(null)}
        newRank={rank}
        previousRank={rankUpFrom ?? "rookie"}
      />
      <MysteryChestModal
        open={chestOpen}
        onClose={() => setChestOpen(false)}
        tier={dailyDropData?.chestTier ?? "common"}
        amount={dailyDropData?.chestCredits ?? 0}
      />
      <Toaster position="top-center" toastOptions={{ style: { borderRadius: "var(--radius-button)" } }} />

      {/* ── Onboarding overlays ──────────────────────────────────────────── */}
      <FirstBetAchievement
        show={showFirstBetAchievement}
        onDone={() => setShowFirstBetAchievement(false)}
      />

      {/* Streak progressive tip */}
      <ProgressiveTip
        show={!ob.streakTipDone && (dailyDropData?.newStreak ?? streak) >= 2}
        icon="🔥"
        title="Daily Streak"
        body="Log in and bet every day to build your streak. Longer streaks unlock bonus credits and exclusive chest rewards."
        onDismiss={() => completeOb("streakTipDone")}
      />

      {/* Rank progressive tip — shown after first rank-up if not yet seen */}
      <ProgressiveTip
        show={!ob.rankTipDone && !rankUpFrom && xp >= 120}
        icon="⭐"
        title="Rank System"
        body="Earn XP by placing bets and winning. Higher ranks unlock bigger daily credits and exclusive profile badges."
        onDismiss={() => completeOb("rankTipDone")}
      />
    </div>
  )
}
