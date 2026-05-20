"use client"

import { useState, useEffect, useCallback } from "react"
import { TrendingUp, Users, User } from "lucide-react"
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
import {
  rankFromXP,
  calculatePersona,
  vetoesFromStreak,
  decayLevel,
  type ChestTier,
} from "@/lib/game-engine"
import type { RankKey } from "@/components/user-profile-card"
import type { BetRecord } from "@/lib/game-engine"
import type { Database } from "@/types/database"

type Screen = "feed" | "circles" | "profile"

const NAV_ITEMS: { id: Screen; label: string; icon: React.ElementType }[] = [
  { id: "feed", label: "Feed", icon: TrendingUp },
  { id: "circles", label: "Circles", icon: Users },
  { id: "profile", label: "Profile", icon: User },
]

interface WinReceiptData {
  market: { title: string; category: string }
  bet: { side: "yes" | "no"; amount: number }
  payout: number
  profit: number
  xpGained: number
}

type Profile = Database['public']['Tables']['profiles']['Row']

export default function App() {
  const [screen, setScreen] = useState<Screen>("feed")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [betHistory, setBetHistory] = useState<BetRecord[]>([])
  const [dailyDropOpen, setDailyDropOpen] = useState(false)
  const [dailyDropData, setDailyDropData] = useState<{
    dropAmount: number; streakBonus: number; multiplier: number
    chestTier: ChestTier | null; chestCredits: number; newStreak: number
  } | null>(null)
  const [winReceipt, setWinReceipt] = useState<WinReceiptData | null>(null)
  const [rankUpFrom, setRankUpFrom] = useState<RankKey | null>(null)
  const [chestOpen, setChestOpen] = useState(false)
  const supabase = createClient()

  const credits = profile?.credits ?? 0
  const xp = profile?.xp ?? 0
  const streak = profile?.streak ?? 0
  const isPlus = profile?.is_plus ?? false
  const rank = profile ? rankFromXP(xp) : "rookie" as RankKey
  const persona = calculatePersona(betHistory)
  const vetoes = vetoesFromStreak(streak, isPlus)

  const daysSinceActive = profile
    ? Math.floor((Date.now() - new Date(profile.last_active_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0
  const decay = decayLevel(daysSinceActive)

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/user')
      if (res.status === 401) {
        window.location.href = '/auth/login'
        return
      }
      if (res.ok) {
        const data = await res.json()
        setProfile(data)

        const prevRank = rankFromXP(data.xp - 60)
        const newRank = rankFromXP(data.xp)
        if (prevRank !== newRank) setRankUpFrom(prevRank)
      } else {
        // Profile missing or server error — redirect to login
        window.location.href = '/auth/login'
      }
    } catch {
      // network error — retry once after 3s
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
        majorityWas: b.side, // approximate
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
        setTimeout(() => setDailyDropOpen(true), 800)
      }
    }
  }, [])

  // Register service worker for push notifications
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failure is non-fatal
      })
    }
  }, [])

  // Restore saved accent colour from localStorage
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

      if (data.chestTier) {
        setTimeout(() => setChestOpen(true), 600)
      }
    }
  }

  const handleChestClose = () => {
    setChestOpen(false)
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
  ) => {
    // Always update the profile balance.
    // serverCredits === undefined means this is the optimistic (pre-API) call.
    // serverCredits !== undefined means this is a post-API correction — just fix the balance.
    setProfile((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        credits: serverCredits ?? prev.credits - amount,
        xp: serverXp ?? prev.xp + 10,
      }
    })

    // Only fire side-effects on the optimistic call, not on the correction call
    if (serverCredits === undefined) {
      // XP float toast
      toast("+10 XP", {
        description: `Bet placed on ${side.toUpperCase()}`,
        duration: 2000,
        style: {
          background: "var(--accent)",
          color: "var(--accent-foreground)",
          border: "none",
          fontSize: "13px",
          fontWeight: "700",
        },
      })

      const newRecord: BetRecord = {
        category: marketCategory as BetRecord["category"],
        side,
        majorityWas,
        won: false,
      }
      setBetHistory((prev) => [...prev, newRecord])

      // Check rank-up after XP gain
      if (profile) {
        const prevRank = rankFromXP(profile.xp)
        const newRank = rankFromXP(profile.xp + 10)
        if (prevRank !== newRank) {
          setRankUpFrom(prevRank)
        }
      }
    }
  }

  const handleWin = (
    marketTitle: string,
    marketCategory: string,
    bet: { side: "yes" | "no"; amount: number },
    payout: number
  ) => {
    const profit = payout - bet.amount
    const xpGained = 60

    // Optimistic update — server already credited on resolve
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
      const newRank = rankFromXP(profile.xp + xpGained)
      if (prevRank !== newRank) setRankUpFrom(prevRank)
    }

    setWinReceipt({
      market: { title: marketTitle, category: marketCategory },
      bet,
      payout,
      profit,
      xpGained,
    })

    // Win XP float — bigger, more celebratory
    toast(`+${xpGained} XP 🎉`, {
      description: `+${profit.toLocaleString()} CR profit`,
      duration: 3500,
      style: {
        background: "var(--color-success, #22c55e)",
        color: "#0A0A0B",
        border: "none",
        fontSize: "14px",
        fontWeight: "800",
      },
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

  return (
    <div className="min-h-screen bg-background flex justify-center">
      <div className="w-full max-w-[430px] flex flex-col relative bg-background border-x border-border min-h-screen">

        {/* Header */}
        <header className="sticky top-0 z-20 bg-background border-b border-border px-4 h-[57px] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" style={{ borderRadius: "var(--radius-badge)" }}>
              <rect width="100" height="100" rx="18" fill="#0A0A0B"/>
              <rect x="22" y="14" width="56" height="18" fill="#F5A623"/>
              <rect x="22" y="14" width="18" height="72" fill="#F5A623"/>
            </svg>
            <span className="font-semibold text-base tracking-tight">Ledge</span>
          </div>

          {decay !== "none" && (
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                decay === "critical" ? "bg-danger" : "bg-accent"
              )} />
              <span className={cn(
                "text-[10px] font-medium uppercase tracking-wider",
                decay === "critical" ? "text-danger" : "text-accent"
              )}>
                {decay === "critical" ? "Rank Decaying" : "Streak at risk"}
              </span>
            </div>
          )}

          <div
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <span className="font-mono text-sm font-semibold tabular-nums text-accent">
              <Ticker value={credits} decimals={0} />
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">CR</span>
          </div>
        </header>

        {/* Screen content */}
        <main className="flex-1 overflow-hidden flex flex-col pb-[65px]">
          {screen === "feed" && (
            <FeedScreen
              availableCredits={credits}
              onBet={handleBet}
              onWin={handleWin}
            />
          )}
          {screen === "circles" && (
            <CirclesScreen
              availableCredits={credits}
              onBet={handleBet}
            />
          )}
          {screen === "profile" && (
            <ProfileScreen
              xp={xp}
              rank={rank}
              credits={credits}
              streak={streak}
              vetoes={vetoes}
              persona={persona}
              decay={decay}
              username={profile.username}
              isPlus={isPlus}
            />
          )}
        </main>

        {/* Bottom navigation */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-20 bg-background border-t border-border">
          <div className="flex">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setScreen(id)}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors duration-200",
                  screen === id ? "text-accent" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn(
                  "w-5 h-5 transition-all duration-200",
                  screen === id && "drop-shadow-[0_0_6px_rgba(245,166,35,0.6)]"
                )} />
                <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Modals */}
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
          onClose={handleChestClose}
          tier={dailyDropData?.chestTier ?? "common"}
          amount={dailyDropData?.chestCredits ?? 0}
        />

        <Toaster
          position="top-center"
          toastOptions={{ style: { borderRadius: "var(--radius-button)" } }}
        />
      </div>
    </div>
  )
}
