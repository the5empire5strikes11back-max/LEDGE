"use client"

import { useState } from "react"
import { Bell, TrendingUp, Flame, Trophy } from "lucide-react"
import { cn } from "@/lib/utils"

interface NotificationPromptProps {
  open: boolean
  onDone: () => void
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

async function subscribeToPush(): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
    const json = sub.toJSON()
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    })
    return true
  } catch {
    return false
  }
}

const EXAMPLES = [
  {
    icon: Trophy,
    color: "text-accent",
    bg: "bg-accent/10",
    text: "Your bet just paid out — you won 847 CR on \"Will BTC hit $100K?\"",
  },
  {
    icon: TrendingUp,
    color: "text-success",
    bg: "bg-success/10",
    text: "Odds shifted — YES is now 72% on a market you're watching",
  },
  {
    icon: Flame,
    color: "text-danger",
    bg: "bg-danger/10",
    text: "Your 7-day streak is at risk — claim today's drop before midnight",
  },
]

export function NotificationPrompt({ open, onDone }: NotificationPromptProps) {
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleEnable = async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === "granted") await subscribeToPush()
    } catch {
      // browser blocked or unsupported — fail silently
    } finally {
      setLoading(false)
      onDone()
    }
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-black/60 animate-in fade-in duration-200">
      <div
        className="w-full max-w-sm bg-background border border-border mx-4 mb-6 overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Bell className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Stay in the loop</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              We&apos;ll only ping you for things that actually matter.
            </p>
          </div>
        </div>

        {/* Example notifications */}
        <div className="px-5 pb-4 flex flex-col gap-2.5">
          {EXAMPLES.map(({ icon: Icon, color, bg, text }, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-3 py-2.5 bg-surface rounded-lg"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", bg)}>
                <Icon className={cn("w-3.5 h-3.5", color)} />
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug pt-0.5">{text}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-5 pb-6 flex flex-col gap-2.5">
          <button
            onClick={handleEnable}
            disabled={loading}
            className={cn(
              "w-full py-3 rounded-full bg-accent text-accent-foreground text-sm font-semibold transition-opacity",
              loading && "opacity-70"
            )}
          >
            {loading ? "Setting up…" : "Turn on notifications"}
          </button>
          <button
            onClick={onDone}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
