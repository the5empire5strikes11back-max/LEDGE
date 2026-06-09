"use client"

import { useState, useEffect, useCallback } from "react"
import { Users, RefreshCw, TrendingUp, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/ui/user-avatar"
import type { FeedItem } from "@/app/api/feed/following/route"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

interface FollowingScreenProps {
  onUsernameClick?: (username: string) => void
}

function BetRow({ item, onUsernameClick }: { item: FeedItem; onUsernameClick?: (u: string) => void }) {
  const isPending = item.won === null
  const won = item.won === true

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0">
      <button onClick={() => onUsernameClick?.(item.username)} className="shrink-0 mt-0.5">
        <UserAvatar username={item.username} avatarUrl={item.avatar_url} size={32} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <button
            onClick={() => onUsernameClick?.(item.username)}
            className="text-xs font-semibold text-foreground hover:text-accent transition-colors"
          >
            @{item.username}
          </button>
          <span className="text-xs text-muted-foreground">bet</span>
          <span className={cn(
            "text-[10px] font-bold uppercase px-1.5 py-0.5",
            item.side === 'yes' ? "text-success bg-success/10" : "text-danger bg-danger/10"
          )} style={{ borderRadius: "var(--radius-badge)" }}>
            {item.side?.toUpperCase()}
          </span>
          {!isPending && (
            <span className={cn(
              "text-[10px] font-bold font-mono",
              won ? "text-success" : "text-danger"
            )}>
              {won ? "✓ W" : "✗ L"}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug truncate">
          {item.market_title}
        </p>
      </div>
      <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono mt-0.5">
        {timeAgo(item.created_at)}
      </span>
    </div>
  )
}

function MarketRow({ item, onUsernameClick }: { item: FeedItem; onUsernameClick?: (u: string) => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0">
      <button onClick={() => onUsernameClick?.(item.username)} className="shrink-0 mt-0.5">
        <UserAvatar username={item.username} avatarUrl={item.avatar_url} size={32} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <button
            onClick={() => onUsernameClick?.(item.username)}
            className="text-xs font-semibold text-foreground hover:text-accent transition-colors"
          >
            @{item.username}
          </button>
          <span className="text-xs text-muted-foreground">created a market</span>
        </div>
        <p className="text-[11px] text-foreground font-medium mt-0.5 leading-snug">
          {item.market_title}
        </p>
        {item.category && (
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">
            {item.category} · {item.yes_percent}% YES
          </span>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/60 shrink-0 font-mono mt-0.5">
        {timeAgo(item.created_at)}
      </span>
    </div>
  )
}

export function FollowingScreen({ onUsernameClick }: FollowingScreenProps) {
  const [items,          setItems]          = useState<FeedItem[]>([])
  const [followingCount, setFollowingCount] = useState(0)
  const [loading,        setLoading]        = useState(true)
  const [refreshing,     setRefreshing]     = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await fetch('/api/feed/following')
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
        setFollowingCount(data.following_count ?? 0)
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Header */}
      <div className="shrink-0 px-4 pt-5 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            <h1 className="text-base font-bold text-foreground">Following</h1>
            {followingCount > 0 && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {followingCount} followed
              </span>
            )}
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex flex-col gap-3 px-4 pt-6 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-2/3" />
                  <div className="skeleton h-2.5 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : followingCount === 0 ? (
          /* Not following anyone yet */
          <div className="flex flex-col items-center justify-center py-20 gap-3 px-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm font-semibold text-foreground">No one followed yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tap any username on the feed, leaderboard, or market activity to follow them and see their bets here.
            </p>
          </div>
        ) : items.length === 0 ? (
          /* Following people but no activity */
          <div className="flex flex-col items-center justify-center py-20 gap-3 px-8 text-center">
            <TrendingUp className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm font-semibold text-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The people you follow haven&apos;t placed bets or created markets in the last 7 days.
            </p>
          </div>
        ) : (
          <div
            className="mx-4 mt-4 mb-6 overflow-hidden border border-border bg-surface"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            {items.map((item) =>
              item.type === 'bet'
                ? <BetRow    key={item.id} item={item} onUsernameClick={onUsernameClick} />
                : <MarketRow key={item.id} item={item} onUsernameClick={onUsernameClick} />
            )}
          </div>
        )}
      </div>

      {/* Discover tip at bottom */}
      {followingCount > 0 && items.length > 0 && (
        <div className="shrink-0 px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Plus className="w-3 h-3" />
            Tap any username to follow more people
          </div>
        </div>
      )}
    </div>
  )
}
