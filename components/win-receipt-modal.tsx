"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Share2, TrendingUp } from "lucide-react"

interface WinReceiptModalProps {
  open: boolean
  onClose: () => void
  market: {
    title: string
    category: string
  }
  bet: {
    side: "yes" | "no"
    amount: number
  }
  payout: number
  profit: number
  newXP: number
  xpGained: number
  username: string
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3 bg-surface border border-border" style={{ borderRadius: "var(--radius-card)" }}>
      <span className={cn("text-xl font-mono font-bold tabular-nums", accent ? "text-success" : "text-foreground")}>
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  )
}

export function WinReceiptModal({
  open,
  onClose,
  market,
  bet,
  payout,
  profit,
  newXP,
  xpGained,
  username,
}: WinReceiptModalProps) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => setVisible(true), 100)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [open])

  const handleShare = async () => {
    const text = `🏆 Just won ${profit.toLocaleString()} credits on Ledge!\n"${market.title}"\nBet ${bet.side.toUpperCase()} · Payout ${payout.toLocaleString()} CR\n\nledge.app`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // silently fail
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="bg-card border-border max-w-md overflow-hidden"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        {/* Green glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-success/10 rounded-full blur-3xl" />
        </div>

        <DialogTitle className="sr-only">Win Receipt</DialogTitle>
        <DialogDescription className="sr-only">Your winning bet receipt</DialogDescription>

        <div className="relative z-10 flex flex-col items-center py-6 gap-5">
          {/* Header badge */}
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 bg-success/15 border border-success/30 transition-all duration-500",
              visible ? "opacity-100 scale-100" : "opacity-0 scale-90"
            )}
            style={{ borderRadius: "9999px" }}
          >
            <TrendingUp className="w-3.5 h-3.5 text-success" />
            <span className="text-xs font-semibold uppercase tracking-widest text-success">You Called It</span>
          </div>

          {/* Profit amount */}
          <div
            className={cn(
              "text-center transition-all duration-500 delay-100",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="text-6xl font-mono font-bold text-success drop-shadow-[0_0_24px_rgba(34,197,94,0.4)]">
              +{profit.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground mt-1 uppercase tracking-widest">credits earned</div>
          </div>

          {/* Market title */}
          <div
            className={cn(
              "w-full px-4 py-3 bg-surface border border-border text-center transition-all duration-500 delay-150",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{market.category}</p>
            <p className="text-sm font-medium text-foreground leading-snug">{market.title}</p>
          </div>

          {/* Stats */}
          <div
            className={cn(
              "grid grid-cols-3 gap-2 w-full transition-all duration-500 delay-200",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <StatBox label="Your Bet" value={`${bet.amount.toLocaleString()} CR`} />
            <StatBox label="Side" value={bet.side.toUpperCase()} />
            <StatBox label="Payout" value={`${payout.toLocaleString()} CR`} accent />
          </div>

          {/* XP gained */}
          <div
            className={cn(
              "flex items-center gap-2 transition-all duration-500 delay-300",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div
              className="px-3 py-1.5 bg-accent/10 border border-accent/30 flex items-center gap-2"
              style={{ borderRadius: "9999px" }}
            >
              <span className="text-accent text-sm">⚡</span>
              <span className="text-accent text-xs font-semibold">+{xpGained} XP</span>
              <span className="text-muted-foreground text-xs">— {newXP.toLocaleString()} total</span>
            </div>
          </div>

          {/* Receipt footer */}
          <div
            className={cn(
              "w-full border-t border-border pt-4 flex flex-col gap-1 transition-all duration-500 delay-350",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-mono">#{username.toUpperCase()}</span>
              <span className="font-mono uppercase tracking-wider">LEDGE · {new Date().toLocaleDateString()}</span>
            </div>
          </div>

          {/* Actions */}
          <div
            className={cn(
              "grid grid-cols-2 gap-3 w-full transition-all duration-500 delay-400",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            )}
          >
            <Button
              variant="outline"
              onClick={handleShare}
              className="border-border text-foreground hover:bg-secondary gap-2"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <Share2 className="w-4 h-4" />
              {copied ? "Copied!" : "Share W"}
            </Button>
            <Button
              onClick={onClose}
              className="bg-success text-success-foreground hover:bg-success/90 font-semibold"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              Keep Going
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
