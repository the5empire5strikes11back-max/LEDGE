"use client"

import { useRef, useState, useCallback } from "react"
import { X, Download, Share2, Check } from "lucide-react"
import { WinCard, LossCard } from "./prediction-result-card"
import type { PredictionResultData } from "./prediction-result-card"

interface PredictionCardOverlayProps {
  data: PredictionResultData
  onClose: () => void
}

export function PredictionCardOverlay({ data, onClose }: PredictionCardOverlayProps) {
  const cardRef      = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"idle" | "downloading" | "sharing" | "done">("idle")

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || status !== "idle") return
    setStatus("downloading")
    try {
      // Dynamic import so the bundle stays small until needed
      const { toPng } = await import("html-to-image")
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 3,                  // 3× → ~1080px wide for a 360px card
        backgroundColor: "#0A0A0B",
        style: { borderRadius: "20px" },
      })
      const a = document.createElement("a")
      a.href = dataUrl
      a.download = `ledge-${data.won ? "win" : "loss"}-${Date.now()}.png`
      a.click()
      setStatus("done")
      setTimeout(() => setStatus("idle"), 2000)
    } catch {
      setStatus("idle")
    }
  }, [data.won, status])

  const handleShare = useCallback(async () => {
    if (status !== "idle") return
    setStatus("sharing")
    const line = data.won
      ? `I called it on Ledge 🎯\n"${data.marketTitle}"\n${data.side.toUpperCase()} · ${data.payoutMultiplier ?? ""}x · +${data.profit?.toLocaleString() ?? ""} CR\n\nledge.app`
      : `The market got me on Ledge.\n"${data.marketTitle}"\nBet ${data.side.toUpperCase()}. Back tomorrow.\n\nledge.app`

    try {
      if (navigator.share) {
        await navigator.share({ text: line, title: "Ledge Prediction" })
      } else {
        await navigator.clipboard.writeText(line)
        setStatus("done")
        setTimeout(() => setStatus("idle"), 2000)
        return
      }
    } catch { /* cancelled */ }
    setStatus("idle")
  }, [data, status])

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ background: "rgba(0,0,0,0.94)", backdropFilter: "blur(14px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
        <div>
          <h2 className="text-[15px] font-bold text-foreground">
            {data.won ? "Share Your Win 🎯" : "Share Your Call"}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Screenshot or download to share
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-surface border border-border hover:bg-secondary transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Card — centered, scrollable on tiny screens */}
      <div className="flex-1 flex items-center justify-center px-5 overflow-y-auto py-2 min-h-0">
        <div ref={cardRef} style={{ display: "inline-block" }}>
          {data.won ? <WinCard data={data} /> : <LossCard data={data} />}
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 px-5 pb-8 pt-4 flex flex-col gap-3">

        {/* Hint */}
        <div
          className="flex items-center gap-2 p-3"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-snug">
            Download saves a high-res PNG (3×) perfect for Instagram Stories.
          </p>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDownload}
            disabled={status !== "idle"}
            className="flex items-center justify-center gap-2 py-3 text-sm font-semibold border border-border bg-surface hover:bg-secondary transition-all active:scale-[0.97] disabled:opacity-50"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            {status === "downloading" ? (
              <span className="text-xs">Saving…</span>
            ) : status === "done" ? (
              <><Check className="w-4 h-4 text-success" /> Saved!</>
            ) : (
              <><Download className="w-4 h-4" /> Download</>
            )}
          </button>

          <button
            onClick={handleShare}
            disabled={status !== "idle"}
            className="flex items-center justify-center gap-2 py-3 text-sm font-bold text-black active:scale-[0.97] disabled:opacity-50 transition-all"
            style={{
              background: data.won
                ? "linear-gradient(135deg, #22C55E 0%, #86EFAC 100%)"
                : "linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 100%)",
              borderRadius: "var(--radius-button)",
            }}
          >
            {status === "sharing" ? (
              <span className="text-xs">Sharing…</span>
            ) : status === "done" ? (
              <><Check className="w-4 h-4" /> Copied!</>
            ) : (
              <><Share2 className="w-4 h-4" /> Share</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
