"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { TrendingUp, Users, User, Zap, Flame, Star, AlertTriangle, ShoppingBag } from "lucide-react"
import { ShopModal } from "@/components/shop-modal"
import { XpProgressBar } from "@/components/xp-progress-bar"
import { XpFloatBadge } from "@/components/xp-float-badge"
import { toast, Toaster } from "sonner"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { DailyDropModal } from "@/components/daily-drop-modal"
import { RankUpModal } from "@/components/rank-up-modal"
import { WinReceiptModal } from "@/components/win-receipt-modal"
import { MysteryChestModal } from "@/components/mystery-chest-modal"
import { CreditShopModal } from "@/components/credit-shop-modal"
import { PublicProfileSheet } from "@/components/public-profile-sheet"
import { NotificationCenter } from "@/components/notification-center"
import { FeedScreen } from "@/components/screens/feed-screen"
import { CirclesScreen } from "@/components/screens/circles-screen"
import { ProfileScreen } from "@/components/screens/profile-screen"
import { Ticker } from "@/components/ui/ticker"
import { UserAvatar } from "@/components/ui/user-avatar"
import { FirstBetAchievement } from "@/components/onboarding/achievement-toast"
import { ProgressiveTip } from "@/components/onboarding/progressive-tip"
import { useOnboarding } from "@/lib/onboarding"
import { applyAccentTheme, getSavedAccent } from "@/lib/accent-theme"
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

const NAV_ITEMS: { id: Screen | "shop"; label: string; icon: React.ElementType }[] = [
  { id: "feed",    label: "Feed",    icon: TrendingUp },
  { id: "circles", label: "Circles", icon: Users },
  { id: "shop",    label: "Shop",    icon: ShoppingBag },
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

const VALID_SCREENS: Screen[] = ["feed", "circles", "profile"]

function screenFromUrl(): Screen {
  if (typeof window === "undefined") return "feed"
  const tab = new URLSearchParams(window.location.search).get("tab")
  return VALID_SCREENS.includes(tab as Screen) ? (tab as Screen) : "feed"
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(screenFromUrl)
  const [circlesBadge, setCirclesBadge] = useState(false)
  const [boostShopOpen, setBoostShopOpen] = useState(false)
  const [isGuest, setIsGuest] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [betHistory, setBetHistory] = useState<BetRecord[]>([])
  const [dailyDropOpen, setDailyDropOpen] = useState(false)
  const [pendingDailyDrop, setPendingDailyDrop] = useState(false)
  // Ref mirror so delayed callbacks read the current value, not a stale closure
  const pendingDailyDropRef = useRef(false)
  useEffect(() => { pendingDailyDropRef.current = pendingDailyDrop }, [pendingDailyDrop])
  const { state: ob, complete: completeOb } = useOnboarding()
  const [showFirstBetAchievement, setShowFirstBetAchievement] = useState(false)
  const [dailyDropData, setDailyDropData] = useState<{
    dropAmount: number; streakBonus: number; multiplier: number
    chestTier: ChestTier | null; chestCredits: number; newStreak: number
  } | null>(null)
  const [winReceipt, setWinReceipt] = useState<WinReceiptData | null>(null)
  const [rankUpFrom, setRankUpFrom] = useState<RankKey | null>(null)
  const [chestOpen, setChestOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [publicProfileUsername, setPublicProfileUsername] = useState<string | null>(null)
  const [xpFloat, setXpFloat] = useState<{ amount: number; key: number }>({ amount: 0, key: 0 })
  const supabase = createClient()

  const credits  = profile?.credits ?? 0
  const xp       = profile?.xp ?? 0
  const streak   = profile?.streak ?? 0
  const isPlus   = profile?.is_plus ?? false
  const rank     = profile ? rankFromXP(xp) : "rookie" as RankKey
  const persona  = calculatePersona(betHistory)
  const vetoes   = vetoesFromStreak(streak, isPlus)
  const rankConfig = RANKS[rank]

  // Fire a floating "+N XP" badge whenever XP increases
  const prevXpRef = useRef(0)
  useEffect(() => {
    if (xp > prevXpRef.current && prevXpRef.current > 0) {
      const gained = xp - prevXpRef.current
      setXpFloat((prev) => ({ amount: gained, key: prev.key + 1 }))
    }
    prevXpRef.current = xp
  }, [xp])

  // Consecutive win streak — walk betHistory in reverse, count leading wins
  const winStreak = (() => {
    let count = 0
    for (let i = betHistory.length - 1; i >= 0; i--) {
      if (betHistory[i].won) count++
      else break
    }
    return count
  })()

  const daysSinceActive = profile
    ? Math.floor((Date.now() - new Date(profile.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0
  const decay = decayLevel(daysSinceActive)

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/user')
      if (res.status === 401) { setIsGuest(true); return }
      if (res.ok) {
        const data = await res.json()
        setProfile(data)
        const prevRank = rankFromXP(data.xp - 60)
        const newRank  = rankFromXP(data.xp)
        if (prevRank !== newRank) setRankUpFrom(prevRank)
      } else {
        setIsGuest(true)
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
    applyAccentTheme(getSavedAccent())
  }, [])

  // Welcome-back toast when returning after >4h with bets in play
  useEffect(() => {
    if (!ob.firstBetAchievementDone) return
    fetch('/api/return-hooks')
      .then((r) => r.ok ? r.json() : [])
      .then((hooks: unknown[]) => {
        if (hooks.length > 0) {
          const last = Number(localStorage.getItem(LS_LAST_APP_OPEN) ?? 0)
          const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000
          if (last < fourHoursAgo) {
            toast(`${hooks.length} bet${hooks.length > 1 ? 's' : ''} still in play`, {
              description: 'Tap the bell to check your predictions',
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
    // Keep the tab in the URL so back/refresh/deep-links work
    const url = new URL(window.location.href)
    if (s === "feed") url.searchParams.delete("tab")
    else url.searchParams.set("tab", s)
    window.history.pushState({}, "", url.toString())
    if (s === 'circles') {
      setCirclesBadge(false)
      localStorage.setItem(LS_LAST_CIRCLES_VISIT, String(Date.now()))
    }
  }

  // Back/forward buttons switch tabs instead of leaving the app
  useEffect(() => {
    const onPop = () => setScreen(screenFromUrl())
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    loadProfile()
    loadBetHistory()
    checkDailyDrop()
  }, [loadProfile, loadBetHistory, checkDailyDrop])

  // Handle Stripe redirect back to app
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    if (!payment) return

    // Clean URL immediately
    window.history.replaceState({}, '', '/')

    if (payment === 'success') {
      const type   = params.get('type')
      const amount = params.get('amount')

      if (type === 'credits' && amount) {
        toast.success(`+${Number(amount).toLocaleString()} CR added!`, {
          description: 'Credits are in your account',
          duration: 5000,
        })
        // Reload profile to reflect new credits
        setTimeout(loadProfile, 1500)
      }

      if (type === 'plus') {
        toast.success('Welcome to Ledge Plus! ✦', {
          description: '2× daily credits and more — starting now',
          duration: 6000,
        })
        setTimeout(loadProfile, 1500)
      }
    }
  }, [loadProfile])

  const handleDailyDropClose = async () => {
    setDailyDropOpen(false)
    if (!ob.dailyDropClaimed) completeOb("dailyDropClaimed")
    // Send the user's LOCAL calendar date so the streak day flips at their midnight.
    const localDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
    const res = await fetch('/api/daily-drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localDate }),
    })
    if (res.ok) {
      const data = await res.json()
      setDailyDropData(data)
      setProfile(data.profile)
      // Surface streak-freeze events Duolingo-style.
      if (data.freezesUsed > 0) {
        toast(`🧊 Streak freeze used — your ${data.newStreak}-day streak is safe`, {
          description: `${data.freezesUsed} freeze${data.freezesUsed > 1 ? 's' : ''} saved you. ${data.freezes} left.`,
          duration: 5000,
        })
      } else if (data.freezeGranted) {
        toast(`🎁 You earned a Streak Freeze!`, {
          description: `${data.newStreak}-day milestone. You now hold ${data.freezes}.`,
          duration: 4500,
        })
      }
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
      // First-bet achievement — delayed to fire after the bet overlay clears (~2.5s)
      if (!ob.firstBetAchievementDone) {
        completeOb("firstBetAchievementDone")
        completeOb("firstBetHintDone")
        setTimeout(() => setShowFirstBetAchievement(true), 2700)
        // Deferred daily drop waits until the achievement and post-bet panel are done.
        if (pendingDailyDrop) {
          setTimeout(() => {
            if (pendingDailyDropRef.current) {
              setPendingDailyDrop(false)
              setDailyDropOpen(true)
            }
          }, 12_000)
        }
      }
      // Non-first bets: overlay already confirms the bet, no extra toast needed.

      const newRecord: BetRecord = { category: marketCategory as BetRecord["category"], side, majorityWas, won: false }
      setBetHistory((prev) => [...prev, newRecord])

      if (profile) {
        const prevRank = rankFromXP(profile.xp)
        const newRank  = rankFromXP(profile.xp + 10)
        if (prevRank !== newRank) setRankUpFrom(prevRank)
      }
    }
  }

  // Called when the first-bet "Prediction locked in" panel is dismissed.
  // Only now do we release the deferred daily drop, so celebrations appear
  // one at a time instead of stacking on top of each other.
  const handleFirstBetFlowDone = useCallback(() => {
    if (pendingDailyDropRef.current) {
      setPendingDailyDrop(false)
      setTimeout(() => setDailyDropOpen(true), 600)
    }
  }, [])

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
    toast(`🎯 You called it! +${profit.toLocaleString()} CR`, {
      description: `+${xpGained} XP earned`,
      duration: 4000,
      style: {
        background: "#0D2010",
        border: "1px solid #22C55E55",
        borderLeft: "3px solid #22C55E",
        color: "#22C55E",
        fontSize: "14px",
        fontWeight: "800",
      },
    })
  }

  if (!profile && !isGuest) {
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
          persona={persona}
          betHistory={betHistory}
          onBet={handleBet}
          onWin={handleWin}
          onOpenShop={() => setShopOpen(true)}
          onOpenDailyDrop={() => setDailyDropOpen(true)}
          onFirstBetFlowDone={handleFirstBetFlowDone}
          onCashout={(newCredits) => setProfile((prev) => prev ? { ...prev, credits: newCredits } : prev)}
          onUsernameClick={(username) => setPublicProfileUsername(username)}
          currentUsername={profile?.username ?? null}
          currentAvatarUrl={(profile as { avatar_url?: string } | null)?.avatar_url ?? null}
          isGuest={isGuest}
        />
      )}
      {screen === "circles" && (
        <CirclesScreen availableCredits={credits} onBet={handleBet} />
      )}
      {screen === "profile" && (
        <ProfileScreen
          xp={xp} rank={rank} credits={credits} streak={streak}
          vetoes={vetoes} persona={persona} decay={decay}
          username={profile?.username ?? ""}
          avatarUrl={(profile as { avatar_url?: string } | null)?.avatar_url ?? null}
          isPlus={isPlus}
          onOpenShop={() => setShopOpen(true)}
          onUsernameClick={(u) => setPublicProfileUsername(u)}
          onCreditsChange={(c) => setProfile((prev) => prev ? { ...prev, credits: c } : prev)}
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
          <div className="ml-auto flex items-center gap-2">
            {decay !== "none" && (
              <div className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse shrink-0",
                decay === "critical" ? "bg-danger" : "bg-accent"
              )} />
            )}
            <NotificationCenter username={profile?.username ?? null} onUsernameClick={(u) => setPublicProfileUsername(u)} />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {(isGuest ? NAV_ITEMS.filter((n) => n.id === "feed") : NAV_ITEMS).map(({ id, label, icon: Icon }) => {
            const circlesBadgeShow = id === 'circles' && circlesBadge
            return (
            <button
              key={id}
              onClick={() => { if (id === "shop") setBoostShopOpen(true); else handleScreenChange(id) }}
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
          {isGuest ? (
            <>
              <p className="text-[11px] text-muted-foreground px-1">
                Predict outcomes and earn credits.
              </p>
              <a
                href="/auth/signup"
                className="w-full py-2.5 text-xs font-black uppercase tracking-widest text-accent-foreground text-center"
                style={{ backgroundColor: "var(--accent)", borderRadius: "var(--radius-button)" }}
              >
                Join Free
              </a>
              <a
                href="/auth/login"
                className="w-full py-2 text-xs font-semibold text-muted-foreground text-center border border-border hover:border-accent/30 transition-colors"
                style={{ borderRadius: "var(--radius-button)" }}
              >
                Sign in
              </a>
            </>
          ) : (
            <>
              {/* Decay warning */}
              {decay !== "none" && (
                <div className={cn(
                  "px-3 py-2 text-[11px] font-medium",
                  decay === "critical"
                    ? "bg-danger/8 border border-danger/25 text-danger"
                    : "bg-accent/8 border border-accent/20 text-accent"
                )} style={{ borderRadius: "var(--radius-button)" }}>
                  <span className="flex items-center gap-1.5">
                    {decay === "critical"
                      ? <><AlertTriangle className="w-3 h-3 shrink-0" />Rank decaying</>
                      : <><Flame className="w-3 h-3 shrink-0 streak-flame" />Streak at risk</>}
                  </span>
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
                  username={profile!.username}
                  avatarUrl={(profile as { avatar_url?: string } | null)?.avatar_url}
                  size={28}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">@{profile!.username}</p>
                  <p className={cn("text-[10px] font-semibold", rankConfig.color)}>
                    {rankConfig.icon} {rankConfig.label}
                  </p>
                </div>
              </button>

              {/* XP progress bar */}
              <div className="px-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-widest">XP</span>
                  <span className="text-[9px] text-muted-foreground font-mono">{xp.toLocaleString()}</span>
                </div>
                <XpProgressBar xp={xp} />
              </div>

              {/* Credits */}
              <button
                onClick={() => setShopOpen(true)}
                className="flex items-center justify-between px-3 py-2 bg-surface border border-border hover:border-accent/40 hover:bg-accent/5 active:scale-[0.97] transition-all duration-[80ms] w-full"
                style={{ borderRadius: "var(--radius-button)" }}
              >
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Credits</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-bold text-accent tabular-nums">
                    <Ticker value={credits} decimals={0} />
                  </span>
                  <span className="text-[10px] text-muted-foreground">CR</span>
                  <span
                    className="text-[9px] font-bold px-1 py-0.5 bg-accent/15 text-accent"
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    + Buy
                  </span>
                </div>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* ── MOBILE: Top Header ───────────────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-background border-b border-border flex flex-col shrink-0">
        <div className="px-4 h-[57px] flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <LedgeLogo size={28} />
            <span className="font-semibold text-base tracking-tight">Ledge</span>
          </div>

          {isGuest ? (
            <div className="flex items-center gap-2">
              <a
                href="/auth/login"
                className="text-xs font-semibold text-muted-foreground px-3 py-1.5"
              >
                Sign in
              </a>
              <a
                href="/auth/signup"
                className="text-xs font-black uppercase tracking-widest text-accent-foreground px-3 py-1.5"
                style={{ backgroundColor: "var(--accent)", borderRadius: "var(--radius-button)" }}
              >
                Join Free
              </a>
            </div>
          ) : (
            <>
              {decay !== "none" && (
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", decay === "critical" ? "bg-danger" : "bg-accent")} />
                  <span className={cn("text-[10px] font-medium uppercase tracking-wider", decay === "critical" ? "text-danger" : "text-accent")}>
                    {decay === "critical" ? "Rank Decaying" : "Streak at risk"}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <NotificationCenter username={profile?.username ?? null} onUsernameClick={(u) => setPublicProfileUsername(u)} />
                <button
                  onClick={() => setShopOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border hover:border-accent/40 active:scale-[0.96] transition-all duration-[80ms]"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  <span className="font-mono text-sm font-semibold tabular-nums text-accent">
                    <Ticker value={credits} decimals={0} />
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">CR</span>
                  <span
                    className="text-[9px] font-bold px-1 py-0.5 bg-accent/15 text-accent"
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    +
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
        {/* XP progress bar — only shown for authenticated users */}
        {!isGuest && <XpProgressBar xp={xp} />}
      </header>

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 lg:ml-[220px] flex flex-col overflow-hidden">
        {/* Mobile top padding — extra 2px for XP bar (omitted for guests) */}
        <div className={cn("lg:hidden shrink-0", isGuest ? "h-[57px]" : "h-[59px]")} />

        {/* Screen */}
        <main
          className="flex-1 min-w-0 flex flex-col overflow-hidden"
          style={{ paddingBottom: "var(--main-pb)" }}
        >
          {screenContent}
        </main>
      </div>

      {/* ── MOBILE: Bottom Navigation ─────────────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-background border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {isGuest ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <a
              href="/auth/login"
              className="flex-1 py-2.5 text-xs font-semibold text-muted-foreground text-center border border-border"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              Sign in
            </a>
            <a
              href="/auth/signup"
              className="flex-[2] py-2.5 text-xs font-black uppercase tracking-widest text-accent-foreground text-center"
              style={{ backgroundColor: "var(--accent)", borderRadius: "var(--radius-button)" }}
            >
              Join Free to Predict
            </a>
          </div>
        ) : (
          <div className="flex">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const circBadge  = id === 'circles' && circlesBadge
              return (
              <button
                key={id}
                onClick={() => { if (id === "shop") setBoostShopOpen(true); else handleScreenChange(id) }}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors duration-200 relative",
                  screen === id ? "text-accent" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative">
                  <Icon className={cn("w-5 h-5 transition-all duration-200", screen === id && "drop-shadow-[0_0_6px_rgba(245,166,35,0.6)]")} />
                  {circBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent border border-background" />
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
              </button>
              )
            })}
          </div>
        )}
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
        username={profile?.username ?? ""}
        rank={rank}
        persona={persona}
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
      <CreditShopModal
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        isPlus={isPlus}
      />
      {/* Boost shop — opened from the main nav */}
      <ShopModal
        open={boostShopOpen}
        onClose={() => setBoostShopOpen(false)}
        onCreditsChange={(c) => setProfile((prev) => prev ? { ...prev, credits: c } : prev)}
        onOpenBuyCredits={() => setShopOpen(true)}
      />
      <PublicProfileSheet
        username={publicProfileUsername}
        onClose={() => setPublicProfileUsername(null)}
      />

      <Toaster position="top-center" toastOptions={{ style: { borderRadius: "var(--radius-button)" } }} />

      {/* Floating +XP badge — fires on any XP gain, sits above the bottom nav */}
      <XpFloatBadge amount={xpFloat.amount} triggerKey={xpFloat.key} />

      {/* ── Onboarding overlays ──────────────────────────────────────────── */}
      <FirstBetAchievement
        show={showFirstBetAchievement}
        onDone={() => setShowFirstBetAchievement(false)}
      />

      {/* Streak progressive tip */}
      <ProgressiveTip
        show={!ob.streakTipDone && (dailyDropData?.newStreak ?? streak) >= 2}
        icon={Flame}
        title="Daily Streak"
        body="Log in and bet every day to build your streak. Longer streaks unlock bonus credits and exclusive chest rewards."
        onDismiss={() => completeOb("streakTipDone")}
      />

      {/* Rank progressive tip — shown after first rank-up if not yet seen */}
      <ProgressiveTip
        show={!ob.rankTipDone && !rankUpFrom && xp >= 120}
        icon={Star}
        title="Rank System"
        body="Earn XP by placing bets and winning. Higher ranks unlock bigger daily credits and exclusive profile badges."
        onDismiss={() => completeOb("rankTipDone")}
      />
    </div>
  )
}
