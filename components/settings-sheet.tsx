"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { X, LogOut, User, Info, ChevronRight, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  username: string
}

export function SettingsSheet({ open, onClose, username }: SettingsSheetProps) {
  const [loggingOut, setLoggingOut] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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
          "w-full max-w-[430px] bg-surface-2 border-t border-border",
          "overflow-hidden",
          "animate-in slide-in-from-bottom-4 duration-[350ms]"
        )}
        style={{ borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0" }}
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

          {/* ── LEGAL ── */}
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Legal</span>
            </div>

            <div
              className="bg-card border border-border overflow-hidden"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <Link
                href="/privacy"
                target="_blank"
                className="flex items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary transition-colors"
              >
                <span className="text-sm font-medium text-foreground">Privacy Policy</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
              <Link
                href="/terms"
                target="_blank"
                className="flex items-center justify-between px-4 py-3 border-b border-border hover:bg-secondary transition-colors"
              >
                <span className="text-sm font-medium text-foreground">Terms of Service</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Link>
              <a
                href="mailto:support@ledge.app"
                className="flex items-center justify-between px-4 py-3 hover:bg-secondary transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-foreground">Delete My Account</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Email us to request deletion</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </a>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
