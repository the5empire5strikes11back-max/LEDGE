"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, X, Check, CheckCheck } from "lucide-react"
import { cn } from "@/lib/utils"

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
  /** Username of the current user — used to re-fetch on auth change */
  username?: string | null
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const TYPE_ICON: Record<string, string> = {
  market_resolved: "🎯",
  odds_shift:      "📊",
  streak_at_risk:  "🔥",
  comment_reply:   "💬",
  market_activity: "📈",
}

export function NotificationCenter({ username }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!username) return
    setLoading(true)
    try {
      const res = await fetch("/api/notifications")
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
        setUnreadCount(data.unread_count ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [username])

  // Load on mount and whenever username changes
  useEffect(() => { load() }, [load])

  // Polling: refresh every 60s while panel is open
  useEffect(() => {
    if (!open) return
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [open, load])

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read)
    if (!unread.length) return
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    await fetch("/api/notifications", { method: "PATCH" })
  }, [notifications])

  const markOneRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, read: true } : n)
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    })
  }, [])

  const openPanel = () => {
    setOpen(true)
    load()
  }

  return (
    <>
      {/* Bell button */}
      <button
        onClick={openPanel}
        className="relative w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center bg-accent text-accent-foreground text-[9px] font-black px-0.5"
            style={{ borderRadius: "9999px" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Notification sheet */}
      {open && (
        <div
          className="fixed bottom-0 inset-x-0 z-50 bg-surface-2 border-t border-border flex flex-col"
          style={{
            borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0",
            maxHeight: "75dvh",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="w-3 h-3" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Bell className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="text-xs text-muted-foreground/50 text-center px-8">
                  You'll see market resolutions, odds shifts, and more here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markOneRead(n.id)
                      if (n.url) window.location.href = n.url
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors",
                      n.read
                        ? "hover:bg-muted/20"
                        : "bg-accent/5 hover:bg-accent/10"
                    )}
                  >
                    {/* Icon */}
                    <span className="shrink-0 text-lg leading-none mt-0.5">
                      {TYPE_ICON[n.type] ?? "🔔"}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm leading-snug",
                          n.read ? "text-muted-foreground font-normal" : "text-foreground font-semibold"
                        )}>
                          {n.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground/60 shrink-0 mt-0.5">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/80 mt-0.5 leading-snug">{n.body}</p>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
