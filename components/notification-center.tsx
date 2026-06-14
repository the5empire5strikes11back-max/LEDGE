"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Bell, Trash2, Users, TrendingUp, RefreshCw, Clock, TrendingDown, Scale, Award } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/ui/user-avatar"
import type { FeedItem } from "@/app/api/feed/following/route"

interface ReturnHook {
  type: "resolves_soon" | "winning" | "sentiment_shifted" | "close_call"
  marketId: string
  title: string
  endTime: string
  userSide: "yes" | "no"
  currentOdds: number
  label: string
  urgent: boolean
}

const HOOK_CONFIG: Record<ReturnHook["type"], {
  Icon: React.ElementType
  color: string
  bg: string
  border: string
  chipLabel: string
}> = {
  resolves_soon:     { Icon: Clock,        color: "text-orange-400",  bg: "bg-orange-400/10",  border: "border-orange-400/25", chipLabel: "Closes Soon" },
  winning:           { Icon: Award,        color: "text-success",     bg: "bg-success/10",     border: "border-success/25",    chipLabel: "Winning"     },
  sentiment_shifted: { Icon: TrendingDown, color: "text-accent",      bg: "bg-accent/10",      border: "border-accent/25",     chipLabel: "Crowd Shifted" },
  close_call:        { Icon: Scale,        color: "text-purple-400",  bg: "bg-purple-400/10",  border: "border-purple-400/25", chipLabel: "Close Call"  },
}

interface Notification {
  id: string
  type: string
  title: string
  body: string
  url?: string | null
  read: boolean
  created_at: string
}

interface NotificationCenterProps {
  username?: string | null
  onUsernameClick?: (username: string) => void
}

type Tab = "notifications" | "following"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

const TYPE_ICON: Record<string, string> = {
  market_resolved: "🎯",
  odds_shift:      "📊",
  streak_at_risk:  "🔥",
  comment_reply:   "💬",
  market_activity: "📈",
  new_follower:    "👤",
}

// ── Following feed rows ───────────────────────────────────────────────────────

function BetRow({ item, onUsernameClick }: { item: FeedItem; onUsernameClick?: (u: string) => void }) {
  const won = item.won === true
  const isPending = item.won === null
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 border-b border-border last:border-b-0">
      <button onClick={() => onUsernameClick?.(item.username)} className="shrink-0 mt-0.5">
        <UserAvatar username={item.username} avatarUrl={item.avatar_url} size={28} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <button
            onClick={() => onUsernameClick?.(item.username)}
            className="text-xs font-semibold text-foreground hover:text-accent transition-colors"
          >
            @{item.username}
          </button>
          <span className="text-[10px] text-muted-foreground">bet</span>
          <span
            className={cn(
              "text-[9px] font-bold uppercase px-1 py-0.5",
              item.side === "yes" ? "text-success bg-success/10" : "text-danger bg-danger/10"
            )}
            style={{ borderRadius: "var(--radius-badge)" }}
          >
            {item.side?.toUpperCase()}
          </span>
          {!isPending && (
            <span className={cn("text-[9px] font-bold font-mono", won ? "text-success" : "text-danger")}>
              {won ? "✓ W" : "✗ L"}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug line-clamp-1">
          {item.market_title}
        </p>
      </div>
      <span className="text-[9px] text-muted-foreground/50 shrink-0 font-mono mt-0.5">
        {timeAgo(item.created_at)}
      </span>
    </div>
  )
}

function MarketRow({ item, onUsernameClick }: { item: FeedItem; onUsernameClick?: (u: string) => void }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 border-b border-border last:border-b-0">
      <button onClick={() => onUsernameClick?.(item.username)} className="shrink-0 mt-0.5">
        <UserAvatar username={item.username} avatarUrl={item.avatar_url} size={28} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <button
            onClick={() => onUsernameClick?.(item.username)}
            className="text-xs font-semibold text-foreground hover:text-accent transition-colors"
          >
            @{item.username}
          </button>
          <span className="text-[10px] text-muted-foreground">created a market</span>
        </div>
        <p className="text-[10px] text-foreground font-medium mt-0.5 leading-snug line-clamp-1">
          {item.market_title}
        </p>
        {item.category && (
          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">
            {item.category} · {item.yes_percent}% YES
          </span>
        )}
      </div>
      <span className="text-[9px] text-muted-foreground/50 shrink-0 font-mono mt-0.5">
        {timeAgo(item.created_at)}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function NotificationCenter({ username, onUsernameClick }: NotificationCenterProps) {
  const [open,          setOpen]          = useState(false)
  const [tab,           setTab]           = useState<Tab>("notifications")
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [returnHooks,   setReturnHooks]   = useState<ReturnHook[]>([])
  const [hooksSeen,     setHooksSeen]     = useState(false)
  const [feedItems,     setFeedItems]     = useState<FeedItem[]>([])
  const [followingCount, setFollowingCount] = useState(0)
  const [feedLoading,   setFeedLoading]   = useState(false)
  const feedLoadedRef = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  const loadNotifications = useCallback(async () => {
    if (!username) return
    const res = await fetch("/api/notifications")
    if (res.ok) {
      const data = await res.json()
      setNotifications(data.notifications ?? [])
      setUnreadCount(data.unread_count ?? 0)
    }
  }, [username])

  const loadReturnHooks = useCallback(async () => {
    if (!username) return
    const res = await fetch("/api/return-hooks")
    if (res.ok) setReturnHooks(await res.json())
  }, [username])

  const loadFeed = useCallback(async () => {
    if (!username) return
    setFeedLoading(true)
    try {
      const res = await fetch("/api/feed/following")
      if (res.ok) {
        const data = await res.json()
        setFeedItems(data.items ?? [])
        setFollowingCount(data.following_count ?? 0)
        feedLoadedRef.current = true
      }
    } finally {
      setFeedLoading(false)
    }
  }, [username])

  useEffect(() => { loadNotifications() }, [loadNotifications])
  useEffect(() => { loadReturnHooks() }, [loadReturnHooks])

  // Load following feed the first time the tab opens
  useEffect(() => {
    if (open && tab === "following" && !feedLoadedRef.current) {
      loadFeed()
    }
  }, [open, tab, loadFeed])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // When the panel closes, mark the notifications the user just saw as read in
  // local state too (the server was already marked in openPanel). This makes the
  // "viewed items go away" behavior hold even on an immediate reopen within the
  // same session, not just on the next page load.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })))
    }
    wasOpenRef.current = open
  }, [open])

  // Delete a single notification (removes it from the DB permanently).
  const deleteOne = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setUnreadCount((c) => Math.max(0, c - 1))
    await fetch("/api/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {})
  }, [])

  // Clear all notifications. "Bets that need attention" (return hooks) are
  // live-computed from open bets, not stored notifications, so they're untouched.
  const clearAll = useCallback(async () => {
    setNotifications([])
    setUnreadCount(0)
    await fetch("/api/notifications", { method: "DELETE" }).catch(() => {})
  }, [])

  const markOneRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    })
  }, [])

  // Opening the panel = "seen": load fresh data, then clear the bell badge.
  // Item highlights stay until next open so the user can still spot what was new.
  const openPanel = useCallback(async () => {
    setOpen(true)
    loadReturnHooks()
    await loadNotifications()
    setUnreadCount(0)
    setHooksSeen(true)
    fetch("/api/notifications", { method: "PATCH" }).catch(() => {})
  }, [loadReturnHooks, loadNotifications])

  // After viewing, read notifications "go away" — the list shows only unread
  // items. Opening the panel marks everything read on the server (openPanel),
  // so seen items vanish on the next open until a genuinely new one arrives.
  // "Bets that need attention" live in returnHooks and always persist.
  const visibleNotifications = notifications.filter((n) => !n.read)

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => { if (open) setOpen(false); else openPanel() }}
        className="relative w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {(() => {
          const urgentCount = hooksSeen ? 0 : returnHooks.filter((h) => h.urgent).length
          const badge = unreadCount + urgentCount
          if (badge === 0) return null
          return (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center bg-accent text-accent-foreground text-[9px] font-black px-0.5"
              style={{ borderRadius: "9999px" }}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )
        })()}
      </button>

      {/* Dropdown — pinned to viewport edges on mobile, anchored under the bell on desktop */}
      {open && (
        <div
          className="fixed left-2 right-2 top-[64px] lg:absolute lg:left-auto lg:right-0 lg:top-full lg:mt-2 lg:w-80 bg-surface-2 border border-border shadow-xl z-50 flex flex-col overflow-hidden"
          style={{ borderRadius: "var(--radius-card)", maxHeight: "480px" }}
        >
          {/* Tab bar */}
          <div className="flex border-b border-border shrink-0">
            <button
              onClick={() => setTab("notifications")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors",
                tab === "notifications"
                  ? "text-foreground border-b-2 border-accent -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bell className="w-3 h-3" />
              Alerts
              {unreadCount > 0 && (
                <span
                  className="min-w-[14px] h-[14px] px-0.5 bg-accent text-accent-foreground text-[8px] font-black flex items-center justify-center"
                  style={{ borderRadius: "9999px" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("following")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors",
                tab === "following"
                  ? "text-foreground border-b-2 border-accent -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="w-3 h-3" />
              Following
              {followingCount > 0 && (
                <span className="text-[9px] text-muted-foreground/60 font-mono">{followingCount}</span>
              )}
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1">

            {/* ── Notifications tab ── */}
            {tab === "notifications" && (
              <>
                {/* Return hooks — bets in play that need attention */}
                {returnHooks.length > 0 && (
                  <div className="border-b border-border">
                    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                        {returnHooks.some((h) => h.urgent)
                          ? `⚡ ${returnHooks.length} bet${returnHooks.length > 1 ? "s" : ""} need attention`
                          : `${returnHooks.length} active bet${returnHooks.length > 1 ? "s" : ""} in play`}
                      </p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-none px-3 pb-3">
                      {returnHooks.map((hook, i) => {
                        const cfg = HOOK_CONFIG[hook.type]
                        const Icon = cfg.Icon
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setOpen(false)
                              window.location.href = `/?m=${hook.marketId}`
                            }}
                            className={cn(
                              "shrink-0 flex flex-col gap-1 px-2.5 py-2 border min-w-[130px] max-w-[160px] text-left transition-colors active:scale-[0.96]",
                              cfg.bg, cfg.border,
                              hook.urgent && "animate-pulse"
                            )}
                            style={{ borderRadius: "var(--radius-card)" }}
                          >
                            <div className="flex items-center gap-1.5">
                              <Icon className={cn("w-3 h-3 shrink-0", cfg.color)} />
                              <span className={cn("text-[9px] font-bold uppercase tracking-wider", cfg.color)}>
                                {cfg.chipLabel}
                              </span>
                            </div>
                            <p className="text-[10px] text-foreground font-medium leading-tight line-clamp-2">
                              {hook.title}
                            </p>
                            <div className="flex items-center gap-1">
                              <span className={cn(
                                "text-[9px] font-bold px-1 py-0.5 uppercase",
                                hook.userSide === "yes" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                              )} style={{ borderRadius: "var(--radius-badge)" }}>
                                {hook.userSide.toUpperCase()}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-mono">{hook.currentOdds}%</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {visibleNotifications.length > 0 && (
                  <div className="flex items-center justify-end px-3 py-2 border-b border-border/50">
                    <button
                      onClick={clearAll}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-danger transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear all
                    </button>
                  </div>
                )}
                {visibleNotifications.length === 0 && returnHooks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Bell className="w-6 h-6 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground">You&apos;re all caught up</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {visibleNotifications.map((n) => (
                      <div
                        key={n.id}
                        className="group flex items-stretch bg-accent/5 hover:bg-accent/10 transition-colors"
                      >
                        <button
                          onClick={() => {
                            if (!n.read) markOneRead(n.id)
                            setOpen(false)
                            if (n.url) window.location.href = n.url
                          }}
                          className="flex-1 min-w-0 text-left px-3 py-2.5 flex items-start gap-2.5"
                        >
                          <span className="shrink-0 text-sm leading-none mt-0.5">{TYPE_ICON[n.type] ?? "🔔"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs leading-snug text-foreground font-semibold">
                                {n.title}
                              </p>
                              <span className="text-[9px] text-muted-foreground/60 shrink-0">{timeAgo(n.created_at)}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-snug">{n.body}</p>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteOne(n.id) }}
                          aria-label="Delete notification"
                          className="shrink-0 px-2.5 flex items-center text-muted-foreground/35 hover:text-danger transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Following tab ── */}
            {tab === "following" && (
              <>
                {feedLoading ? (
                  <div className="flex flex-col gap-3 px-3 py-4 animate-pulse">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="skeleton w-7 h-7 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="skeleton h-2.5 w-2/3" />
                          <div className="skeleton h-2 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : followingCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 px-4 text-center">
                    <Users className="w-7 h-7 text-muted-foreground/20" />
                    <p className="text-xs font-semibold text-foreground">No one followed yet</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Tap any username on the feed or leaderboard to follow them.
                    </p>
                  </div>
                ) : feedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 px-4 text-center">
                    <TrendingUp className="w-7 h-7 text-muted-foreground/20" />
                    <p className="text-xs font-semibold text-foreground">No recent activity</p>
                    <p className="text-[10px] text-muted-foreground">
                      People you follow haven&apos;t been active in the last 7 days.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {followingCount} following
                      </span>
                      <button
                        onClick={loadFeed}
                        disabled={feedLoading}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <RefreshCw className={cn("w-3 h-3", feedLoading && "animate-spin")} />
                      </button>
                    </div>
                    <div className="divide-y divide-border">
                      {feedItems.map((item) =>
                        item.type === "bet"
                          ? <BetRow    key={item.id} item={item} onUsernameClick={(u) => { onUsernameClick?.(u); setOpen(false) }} />
                          : <MarketRow key={item.id} item={item} onUsernameClick={(u) => { onUsernameClick?.(u); setOpen(false) }} />
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
