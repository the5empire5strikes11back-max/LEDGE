"use client"

import { useState } from "react"
import { X, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

type MarketCategory = "Sports" | "Politics" | "Culture" | "Tech" | "Viral" | "Wild"

interface CreateMarketSheetProps {
  open: boolean
  onClose: () => void
  /** Called after successful submission. isReview=true means it's pending moderation. */
  onCreated: (isReview: boolean) => void
}

const CATEGORIES: MarketCategory[] = ["Sports", "Politics", "Culture", "Tech", "Viral", "Wild"]

const CATEGORY_EXAMPLES: Record<MarketCategory, string> = {
  Sports:   "e.g. Will Real Madrid win the Champions League?",
  Politics: "e.g. Will the UK hold a general election before 2027?",
  Culture:  "e.g. Will Beyoncé release a new album this year?",
  Tech:     "e.g. Will OpenAI release GPT-5 before July?",
  Viral:    "e.g. Will this TikTok sound hit 1B uses this month?",
  Wild:     "e.g. Will it snow in LA before the end of the year?",
}

const CATEGORY_ICONS: Record<MarketCategory, string> = {
  Sports:   "🏆",
  Politics: "🗳️",
  Culture:  "🎬",
  Tech:     "⚡",
  Viral:    "🔥",
  Wild:     "🎲",
}

const MIN_TITLE_LENGTH = 15
const MAX_TITLE_LENGTH = 200
const MAX_CRITERIA_LENGTH = 400

// ── Duration slider bounds ────────────────────────────────────────────────────
const MIN_HOURS = 2          // matches the server's minimum market lifetime
const MAX_HOURS = 720        // 30 days — "under a month"
const DEFAULT_HOURS = 72     // 3 days

// ── Custom category bounds ────────────────────────────────────────────────────
const CUSTOM_CAT_MIN = 2
const CUSTOM_CAT_MAX = 20

/** Snap a raw hour value to sensible increments so the slider lands on round
 *  durations: 1h steps under a day, 6h up to a week, 1-day beyond. */
function snapHours(h: number): number {
  if (h <= 24) return Math.max(MIN_HOURS, Math.round(h))
  if (h <= 168) return Math.round(h / 6) * 6
  return Math.round(h / 24) * 24
}

/** Human-friendly duration label, e.g. "5 hours", "3 days", "2 weeks". */
function formatDuration(hours: number): string {
  if (hours < 24) {
    const h = Math.round(hours)
    return `${h} hour${h === 1 ? "" : "s"}`
  }
  const days = hours / 24
  if (days < 14) {
    const d = Math.round(days)
    return `${d} day${d === 1 ? "" : "s"}`
  }
  const weeks = Math.round(days / 7)
  return `${weeks} week${weeks === 1 ? "" : "s"}`
}

/** Absolute close date label for the chosen duration. */
function formatCloseDate(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000)
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  })
}

export function CreateMarketSheet({ open, onClose, onCreated }: CreateMarketSheetProps) {
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<MarketCategory>("Sports")
  const [useCustom, setUseCustom] = useState(false)
  const [customCategory, setCustomCategory] = useState("")
  const [durationHours, setDurationHours] = useState(DEFAULT_HOURS)
  const [criteria, setCriteria] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleTrimmed = title.trim()
  const criteriaText = criteria.trim()
  const customTrimmed = customCategory.trim()
  const isQuestion = titleTrimmed.endsWith("?")
  // Compound question: more than one '?' (e.g. "Will X? And will Y?")
  const isCompound = (titleTrimmed.match(/\?/g) ?? []).length > 1
  const isTooShort = titleTrimmed.length < MIN_TITLE_LENGTH
  const isTooLong = titleTrimmed.length > MAX_TITLE_LENGTH
  const isCriteriaTooLong = criteriaText.length > MAX_CRITERIA_LENGTH
  const isCustomValid = !useCustom || (customTrimmed.length >= CUSTOM_CAT_MIN && customTrimmed.length <= CUSTOM_CAT_MAX)
  const canSubmit = isQuestion && !isCompound && !isTooShort && !isTooLong && !isCriteriaTooLong && isCustomValid && !submitting

  // Inline hint shown below the textarea
  const inputHint: string | null =
    titleTrimmed.length > 0 && !isQuestion ? "End with a ?" :
    isCompound ? "One question per prediction" :
    isTooShort ? `Min ${MIN_TITLE_LENGTH} characters` :
    null

  const placeholder = useCustom ? "e.g. Will my prediction come true this week?" : CATEGORY_EXAMPLES[category]

  const handleClose = () => {
    if (submitting) return
    setTitle("")
    setCategory("Sports")
    setUseCustom(false)
    setCustomCategory("")
    setDurationHours(DEFAULT_HOURS)
    setCriteria("")
    setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      const endTimeIso = new Date(Date.now() + durationHours * 3_600_000).toISOString()
      const res = await fetch("/api/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleTrimmed,
          // A custom category is sent as a free-text tag; the system buckets it
          // under "Wild" and displays the custom label. Otherwise a real category.
          category: useCustom ? "Wild" : category,
          ...(useCustom ? { subcategory: customTrimmed } : {}),
          end_time: endTimeIso,
          ...(criteriaText ? { resolution_criteria: criteriaText } : {}),
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
          "fixed bottom-0 inset-x-0 z-50 bg-surface-2 border-t border-border",
          "max-h-[90dvh] overflow-y-auto"
        )}
        style={{ borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border sticky top-0 bg-surface-2 z-10">
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
              placeholder={placeholder}
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

          {/* Resolution criteria */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                How will this resolve? <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <span className={cn(
                "text-[10px] font-mono tabular-nums",
                isCriteriaTooLong ? "text-danger" : "text-muted-foreground/40"
              )}>
                {criteriaText.length}/{MAX_CRITERIA_LENGTH}
              </span>
            </div>
            <textarea
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder={`e.g. Resolves YES if an official announcement is made by ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.`}
              rows={2}
              maxLength={MAX_CRITERIA_LENGTH + 10}
              className={cn(
                "w-full bg-surface border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40",
                "resize-none focus:outline-none focus:ring-1 transition-colors",
                isCriteriaTooLong ? "border-danger focus:ring-danger" : "border-border focus:ring-accent/50"
              )}
              style={{ borderRadius: "var(--radius-card)" }}
            />
            <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
              Helps bettors understand exactly when YES or NO wins. Makes your market more trustworthy.
            </p>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setCategory(cat); setUseCustom(false) }}
                  className={cn(
                    "py-2.5 text-xs font-semibold uppercase tracking-wider border flex flex-col items-center gap-1",
                    "transition-all duration-[80ms] ease-[var(--ease-sharp)] active:scale-[0.96]",
                    !useCustom && category === cat
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-surface text-muted-foreground border-border hover:border-muted-foreground/40 hover:text-foreground active:bg-muted"
                  )}
                  style={{ borderRadius: "var(--radius-badge)" }}
                >
                  <span className="text-base leading-none">{CATEGORY_ICONS[cat]}</span>
                  <span>{cat}</span>
                </button>
              ))}
            </div>

            {/* Make your own category */}
            <button
              onClick={() => setUseCustom((v) => !v)}
              className={cn(
                "w-full py-2 text-[11px] font-semibold border flex items-center justify-center gap-1.5",
                "transition-all duration-[80ms] ease-[var(--ease-sharp)] active:scale-[0.98]",
                useCustom
                  ? "bg-accent/15 text-accent border-accent/40"
                  : "bg-surface text-muted-foreground border-dashed border-border hover:border-muted-foreground/40 hover:text-foreground"
              )}
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              {useCustom ? "Using a custom category" : "Make your own category"}
            </button>

            {useCustom && (
              <div className="space-y-1 pt-1">
                <input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Crypto, Local, School…"
                  maxLength={CUSTOM_CAT_MAX + 4}
                  className={cn(
                    "w-full bg-surface border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40",
                    "focus:outline-none focus:ring-1 transition-colors",
                    customTrimmed.length > CUSTOM_CAT_MAX ? "border-danger focus:ring-danger" : "border-border focus:ring-accent/50"
                  )}
                  style={{ borderRadius: "var(--radius-button)" }}
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground/50">
                  {customTrimmed.length > CUSTOM_CAT_MAX
                    ? `Keep it under ${CUSTOM_CAT_MAX} characters`
                    : "Shown as the market's category. Lives in the Wild feed."}
                </p>
              </div>
            )}
          </div>

          {/* Closes in — draggable duration */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Closes in
              </label>
              <span className="text-sm font-bold text-accent tabular-nums">
                {formatDuration(durationHours)}
              </span>
            </div>
            <input
              type="range"
              min={MIN_HOURS}
              max={MAX_HOURS}
              step={1}
              value={durationHours}
              onChange={(e) => setDurationHours(snapHours(Number(e.target.value)))}
              className="w-full cursor-pointer"
              style={{ accentColor: "var(--accent)" }}
              aria-label="Market duration"
            />
            <div className="flex items-center justify-between text-[9px] text-muted-foreground/40 font-mono">
              <span>2h</span>
              <span>1 week</span>
              <span>1 month</span>
            </div>
            <p className="text-[10px] text-muted-foreground/50">
              Closes {formatCloseDate(durationHours)}
            </p>
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
              "w-full py-3 text-sm font-bold uppercase tracking-wider border",
              "transition-all duration-[80ms] ease-[var(--ease-sharp)]",
              canSubmit
                ? "bg-accent text-accent-foreground border-accent hover:opacity-90 active:scale-[0.97] active:opacity-80"
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
