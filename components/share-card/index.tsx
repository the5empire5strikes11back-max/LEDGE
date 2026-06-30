"use client"

import { useState, useEffect, useRef } from "react"
import { X, Share2, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { PersonaCard } from "./persona-card"
import { RankCard } from "./rank-card"
import { FlexCard } from "./flex-card"
import { StreakCard } from "./streak-card"
import { LeaderboardCard } from "./leaderboard-card"
import { xpProgress } from "@/lib/game-engine"
import type { Persona } from "@/lib/game-engine"
import type { RankKey } from "@/components/user-profile-card"
import type { ShareCardData } from "@/app/api/share-cards/route"

interface ShareCardModalProps {
  username: string
  xp: number
  rank: RankKey
  credits: number
  streak: number
  persona: Persona
  winRate: number
  marketsPlayed: number
  leaderboardRank: number | null
  bestStreak: number
  onClose: () => void
}

type CardTab = "persona" | "rank" | "flex" | "streak" | "leaderboard"

const TABS: { id: CardTab; label: string; emoji: string }[] = [
  { id: "persona",     label: "Persona",    emoji: "🎭" },
  { id: "rank",        label: "Rank",       emoji: "✦"  },
  { id: "flex",        label: "Best Bet",   emoji: "🎯" },
  { id: "streak",      label: "Streak",     emoji: "🔥" },
  { id: "leaderboard", label: "Rank",       emoji: "🏆" },
]

export function ShareCardModal({
  username,
  xp,
  rank,
  credits,
  streak,
  persona,
  winRate,
  marketsPlayed,
  leaderboardRank,
  bestStreak,
  onClose,
}: ShareCardModalProps) {
  const [activeTab, setActiveTab] = useState<CardTab>("persona")
  const [cardData, setCardData] = useState<ShareCardData | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [sharing, setSharing] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const progress = xpProgress(xp)

  // Fetch share card data (best bet, crowd-against %)
  useEffect(() => {
    fetch('/api/share-cards')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setCardData(d); setLoadingData(false) })
      .catch(() => setLoadingData(false))
  }, [])

  const handleShare = async () => {
    setSharing(true)
    try {
      const text = buildShareText()
      if (navigator.share) {
        await navigator.share({ text, title: "My Ledge Identity Card" })
      } else {
        await navigator.clipboard.writeText(text)
        // Brief feedback
      }
    } finally {
      setSharing(false)
    }
  }

  function buildShareText(): string {
    switch (activeTab) {
      case "persona":
        return `I'm ${persona.label} on Ledge — ${winRate}% win rate across ${marketsPlayed} predictions. ${persona.emoji}\n\nledge-phi.vercel.app`
      case "rank":
        return `Just hit ${rank.toUpperCase()} rank on Ledge with ${xp.toLocaleString()} XP ✦\n\nledge-phi.vercel.app`
      case "flex":
        if (cardData?.bestBet) {
          const { marketTitle, payoutMultiplier, side, profit } = cardData.bestBet
          return `Called it on Ledge 🎯\n\n"${marketTitle}"\n${side.toUpperCase()} · ${payoutMultiplier}x payout · +${profit.toLocaleString()} CR\n\nledge-phi.vercel.app`
        }
        return "Making predictions on Ledge. ledge-phi.vercel.app"
      case "streak":
        return `${streak}-day prediction streak on Ledge 🔥\n\nledge-phi.vercel.app`
      case "leaderboard":
        return leaderboardRank
          ? `#${leaderboardRank} on the Ledge global leaderboard 🏆\n\nledge-phi.vercel.app`
          : "On the Ledge leaderboard. ledge-phi.vercel.app"
    }
  }

  // Tab navigation
  const tabIndex = TABS.findIndex((t) => t.id === activeTab)
  const prevTab = tabIndex > 0 ? TABS[tabIndex - 1].id : null
  const nextTab = tabIndex < TABS.length - 1 ? TABS[tabIndex + 1].id : null

  // Filter tabs based on available data
  const availableTabs = TABS.filter((t) => {
    if (t.id === "flex" && !cardData?.bestBet) return false
    if (t.id === "leaderboard" && !leaderboardRank) return false
    return true
  })

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-safe-top pt-5 pb-3">
        <div>
          <h2 className="text-[15px] font-bold text-foreground">Identity Card</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Screenshot to share</p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-border hover:bg-secondary transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Tab pills */}
      <div className="px-5 pb-4">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all duration-150",
                activeTab === tab.id
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface text-muted-foreground border border-border hover:text-foreground"
              )}
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Card display */}
      <div className="flex-1 flex items-center justify-center px-5 py-2 min-h-0">
        <div className="relative">
          {/* Left nav arrow */}
          {prevTab && availableTabs.find((t) => t.id === prevTab) && (
            <button
              onClick={() => setActiveTab(prevTab)}
              className="absolute -left-10 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Card */}
          <div
            ref={cardRef}
            className="transition-all duration-300"
            style={{
              transform: "scale(1)",
              // Scale down on very small screens
              maxWidth: "min(360px, calc(100vw - 40px))",
            }}
          >
            {activeTab === "persona" && (
              <PersonaCard
                persona={persona}
                username={username}
                winRate={winRate}
                marketsPlayed={marketsPlayed}
                crowdAgainstPct={cardData?.crowdAgainstPct ?? 0}
              />
            )}
            {activeTab === "rank" && (
              <RankCard
                rank={rank}
                xp={xp}
                username={username}
                xpToNext={progress.nextRank ? progress.required - progress.current : undefined}
                nextRank={progress.nextRank}
              />
            )}
            {activeTab === "flex" && cardData?.bestBet && (
              <FlexCard bet={cardData.bestBet} username={username} />
            )}
            {activeTab === "streak" && (
              <StreakCard
                currentStreak={streak}
                bestStreak={bestStreak}
                username={username}
              />
            )}
            {activeTab === "leaderboard" && leaderboardRank && (
              <LeaderboardCard
                username={username}
                leaderboardRank={leaderboardRank}
                credits={credits}
                winRate={winRate}
                marketsPlayed={marketsPlayed}
              />
            )}
          </div>

          {/* Right nav arrow */}
          {nextTab && availableTabs.find((t) => t.id === nextTab) && (
            <button
              onClick={() => setActiveTab(nextTab)}
              className="absolute -right-10 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="px-5 pb-safe-bottom pb-6 pt-4">
        <div
          className="flex items-center gap-3 p-3 mb-4"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-snug">
            Screenshot this card and share it wherever. Your predictions define you.
          </p>
        </div>

        <button
          onClick={handleShare}
          disabled={sharing || loadingData}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3.5 font-bold text-sm uppercase tracking-wider transition-all duration-150 active:scale-[0.98]",
            sharing ? "opacity-60 cursor-not-allowed" : ""
          )}
          style={{
            background: "linear-gradient(135deg, #F5A623 0%, #FFD700 50%, #F5A623 100%)",
            color: "#0A0A0B",
            borderRadius: "var(--radius-button)",
          }}
        >
          <Share2 className="w-4 h-4" />
          {sharing ? "Sharing..." : "Share Card"}
        </button>
      </div>
    </div>
  )
}
