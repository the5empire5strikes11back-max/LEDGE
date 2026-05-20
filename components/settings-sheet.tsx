"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { X, LogOut, Palette, User, Info, ChevronRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const ACCENT_COLORS = [
  { name: "Amber",      value: "#F5A623", fg: "#0A0A0B" },
  { name: "Blue",       value: "#3B82F6", fg: "#ffffff" },
  { name: "Green",      value: "#22C55E", fg: "#0A0A0B" },
  { name: "Purple",     value: "#8B5CF6", fg: "#ffffff" },
  { name: "Red",        value: "#EF4444", fg: "#ffffff" },
  { name: "Pink",       value: "#EC4899", fg: "#ffffff" },
  { name: "Cyan",       value: "#06B6D4", fg: "#0A0A0B" },
  { name: "White",      value: "#E2E8F0", fg: "#0A0A0B" },
]

const STORAGE_KEY = "ledge_accent"

function applyAccent(hex: string, fg: string) {
  const root = document.documentElement
  root.style.setProperty("--accent", hex)
  root.style.setProperty("--accent-foreground", fg)
  root.style.setProperty("--primary", hex)
  root.style.setProperty("--primary-foreground", fg)
  root.style.setProperty("--ring", hex)
}

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  username: string
}

export function SettingsSheet({ open, onClose, username }: SettingsSheetProps) {
  const [activeAccent, setActiveAccent] = useState(ACCENT_COLORS[0])
  const [loggingOut, setLoggingOut] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Load saved accent on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const found = ACCENT_COLORS.find((c) => c.value === saved)
      if (found) {
        setActiveAccent(found)
        applyAccent(found.value, found.fg)
      }
    }
  }, [])

  const handleAccentChange = (color: typeof ACCENT_COLORS[0]) => {
    setActiveAccent(color)
    applyAccent(color.value, color.fg)
    localStorage.setItem(STORAGE_KEY, color.value)
  }

  const handleLogout = async () => {
    if (!confirmLogout) {
      setConfirmLogout(true)
      return
    }
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  // Reset confirm state when sheet closes
  useEffect(() => {
    if (!open) setConfirmLogout(false)
  }, [open])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          "fixed bottom-0 left-1/2 -translate-x-1/2 z-50",
          "w-full max-w-[430px] bg-background border-t border-border",
          "rounded-t-2xl overflow-hidden",
          "animate-in slide-in-from-bottom-4 duration-300"
        )}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-sm font-semibold tracking-tight">Settings</span>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[75vh] pb-8">

          {/* ── APPEARANCE ── */}
          <div className="px-5 pt-5 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Appearance</span>
            </div>

            <div
              className="bg-card border border-border p-4 space-y-3"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <p className="text-xs font-medium text-foreground">Accent Color</p>
              <div className="grid grid-cols-8 gap-2">
                {ACCENT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => handleAccentChange(color)}
                    title={color.name}
                    className="relative w-full aspect-square flex items-center justify-center transition-transform active:scale-90 hover:scale-110"
                    style={{
                      backgroundColor: color.value,
                      borderRadius: "var(--radius-badge)",
                      boxShadow: activeAccent.value === color.value
                        ? `0 0 0 2px #0A0A0B, 0 0 0 4px ${color.value}`
                        : undefined,
                    }}
                  >
                    {activeAccent.value === color.value && (
                      <Check
                        className="w-3 h-3"
                        style={{ color: color.fg }}
                        strokeWidth={3}
                      />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Currently: <span className="font-medium" style={{ color: activeAccent.value }}>{activeAccent.name}</span>
              </p>
            </div>
          </div>

          {/* ── ACCOUNT ── */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Account</span>
            </div>

            <div
              className="bg-card border border-border overflow-hidden"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              {/* Username row */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Username</p>
                  <p className="text-sm font-mono font-medium mt-0.5">@{username}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>

              {/* Log out */}
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3 transition-colors",
                  confirmLogout
                    ? "bg-danger/10 hover:bg-danger/20"
                    : "hover:bg-secondary"
                )}
              >
                <div className="flex items-center gap-3">
                  <LogOut className={cn("w-4 h-4", confirmLogout ? "text-danger" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", confirmLogout ? "text-danger" : "text-foreground")}>
                    {loggingOut ? "Signing out…" : confirmLogout ? "Tap again to confirm" : "Log Out"}
                  </span>
                </div>
                {confirmLogout && !loggingOut && (
                  <span className="text-[10px] text-danger font-medium uppercase tracking-wider">Confirm</span>
                )}
              </button>
            </div>
          </div>

          {/* ── ABOUT ── */}
          <div className="px-5 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">About</span>
            </div>

            <div
              className="bg-card border border-border overflow-hidden"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              {[
                { label: "App", value: "Ledge" },
                { label: "Version", value: "1.0.0" },
                { label: "Markets", value: "Fake credits only · No real money" },
              ].map((row, i, arr) => (
                <div
                  key={row.label}
                  className={cn(
                    "flex items-center justify-between px-4 py-3",
                    i < arr.length - 1 && "border-b border-border"
                  )}
                >
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <span className="text-xs font-medium text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
