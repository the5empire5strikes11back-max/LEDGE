"use client"

import { useState } from "react"
import { X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type MarketCategory = "Sports" | "Politics" | "Culture"

interface CreateMarketSheetProps {
  open: boolean
  onClose: () => void
  /** Called after successful submission. isReview=true means it's pending moderation. */
  onCreated: (isReview: boolean) => void
}

const CATEGORIES: MarketCategory[] = ["Sports", "Politics", "Culture"]

const CATEGORY_EXAMPLES: Record<MarketCategory, string> = {
  Sports: "e.g. Will Real Madrid win the Champions League?",
  Politics: "e.g. Will the UK hold a general election before 2027?",
  Culture: "e.g. Will Beyoncé release a new album this year?",
}

const MIN_TITLE_LENGTH = 15
const MAX_TITLE_LENGTH = 200

function endTimeOptions(): Array<{ label: string; value: string }> {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

  const opts = [
    { label: "24 hours", hours: 24 },
    { label: "3 days", hours: 72 },
    { label: "1 week", hours: 168 },
    { label: "1 month", hours: 720 },
  ]

  return opts.map(({ label, hours }) => {
    const d = new Date(now.getTime() + hours * 60 * 60_000)
    return { label, value: fmt(d) }
  })
}

export function CreateMarketSheet({ open, onClose, onCreated }: CreateMarketSheetProps) {
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<MarketCategory>("Sports")
  const [endTime, setEndTime] = useState(endTimeOptions()[0].value)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleTrimmed = title.trim()
  const isQuestion = titleTrimmed.endsWith("?")
  // Compound question: more than one '?' (e.g. "Will X? And will Y?")
  const isCompound = (titleTrimmed.match(/\?/g) ?? []).length > 1
  const isTooShort = titleTrimmed.length < MIN_TITLE_LENGTH
  const isTooLong = titleTrimmed.length > MAX_TITLE_LENGTH
  const endDate = new Date(endTime)
  const isEndInFuture = endDate > new Date()
  const canSubmit = isQuestion && !isCompound && !isTooShort && !isTooLong && isEndInFuture && !submitting

  // Inline hint shown below the textarea
  const inputHint: string | null =
    titleTrimmed.length > 0 && !isQuestion ? "End with a ?" :
    isCompound ? "One question per prediction" :
    isTooShort ? `Min ${MIN_TITLE_LENGTH} characters` :
    null

  const handleClose = () => {
    if (submitting) return
    setTitle("")
    setCategory("Sports")
    setEndTime(endTimeOptions()[0].value)
    setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleTrimmed,
          category,
          end_time: new Date(endTime).toISOString(),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error ?? "Failed to create market")
        return
      }

      const result = await res.json().catch(() => ({}))
      const isReview = result._review === true

      handleClose()
      onCreated(isReview)
    } catch {
      setError("Network error — please try again")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const timeOpts = endTimeOptions()
  const charCount = titleTrimmed.length

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Sheet — slides up from bottom */}
      <div
        className={cn(
          "fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border",
          "max-h-[90dvh] overflow-y-auto"
        )}
        style={{ borderRadius: "var(--radius-card) var(--radius-card) 0 0" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border sticky top-0 bg-background">
          <span className="text-sm font-semibold text-foreground">New Prediction</span>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-5 space-y-5 pb-safe-or-5">

          {/* Title input */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Your question
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={CATEGORY_EXAMPLES[category]}
              maxLength={MAX_TITLE_LENGTH + 10}
              rows={3}
              className={cn(
                "w-full bg-surface border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50",
                "resize-none focus:outline-none focus:ring-1 transition-colors",
                isTooLong ? "border-danger focus:ring-danger" : "border-border focus:ring-accent/50"
              )}
              style={{ borderRadius: "var(--radius-card)" }}
              autoFocus
            />
            <div className="flex items-center justify-between min-h-[16px]">
              {inputHint ? (
                <p className="text-[10px] text-muted-foreground">{inputHint}</p>
              ) : <span />}
              <span className={cn(
                "text-[10px] font-mono tabular-nums",
                isTooLong ? "text-danger" : charCount > MAX_TITLE_LENGTH * 0.8 ? "text-muted-foreground" : "text-muted-foreground/40"
              )}>
                {charCount}/{MAX_TITLE_LENGTH}
              </span>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Category
            </label>
            <div className="flex gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold uppercase tracking-wider border transition-all duration-150",
                    category === cat
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-surface text-muted-foreground border-border hover:border-muted-foreground/40 hover:text-foreground"
                  )}
                  style={{ borderRadius: "var(--radius-badge)" }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Closes in */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Closes in
            </label>
            <div className="grid grid-cols-2 gap-2">
              {timeOpts.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setEndTime(opt.value)}
                  className={cn(
                    "py-2 text-xs font-semibold border transition-all duration-150",
                    endTime === opt.value
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-surface text-muted-foreground border-border hover:border-muted-foreground/40 hover:text-foreground"
                  )}
                  style={{ borderRadius: "var(--radius-badge)" }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-danger px-1">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 text-sm font-bold uppercase tracking-wider border transition-all duration-150",
              canSubmit
                ? "bg-accent text-accent-foreground border-accent hover:opacity-90 active:scale-[0.98]"
                : "bg-muted/30 text-muted-foreground border-border cursor-not-allowed"
            )}
            style={{ borderRadius: "var(--radius-button)" }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating…
              </span>
            ) : (
              "Post Prediction"
            )}
          </button>

          {/* Hint */}
          <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed">
            Anyone on Ledge can bet on your prediction.
            <br />
            You earn XP every time someone places a bet.
          </p>
        </div>
      </div>
    </>
  )
}
