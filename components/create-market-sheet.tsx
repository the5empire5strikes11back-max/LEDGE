"use client"

import { useState } from "react"
import { X, Loader2, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { numericBuckets, dateBuckets, normalizeOptions } from "@/lib/market-groups"

type MarketCategory = "Sports" | "Politics" | "Culture" | "Tech" | "Viral" | "Wild"
type MarketType = "yes_no" | "multiple_choice" | "numeric" | "date" | "set" | "poll"

interface CreateMarketSheetProps {
  open: boolean
  onClose: () => void
  onCreated: (isReview: boolean) => void
}

const CATEGORIES: MarketCategory[] = ["Sports", "Politics", "Culture", "Tech", "Viral", "Wild"]
const CATEGORY_ICONS: Record<MarketCategory, string> = {
  Sports: "🏆", Politics: "🗳️", Culture: "🎬", Tech: "⚡", Viral: "🔥", Wild: "🎲",
}

const TYPES: { id: MarketType; label: string; icon: string; desc: string }[] = [
  { id: "yes_no",          label: "Yes / No",        icon: "✓✗", desc: "A simple yes/no question." },
  { id: "multiple_choice", label: "Multiple Choice", icon: "◉",  desc: "Several options — exactly one wins." },
  { id: "numeric",         label: "Numeric",         icon: "123",desc: "A number — answered with tappable ranges." },
  { id: "date",            label: "Date",            icon: "📅", desc: "A when — answered with time windows." },
  { id: "set",             label: "Set",             icon: "☑",  desc: "Several options — any number can win." },
  { id: "poll",            label: "Poll",            icon: "📊", desc: "Just votes, no betting." },
]

const MIN_TITLE = 8
const MAX_TITLE = 200
const MIN_HOURS = 2
const MAX_HOURS = 720
const DEFAULT_HOURS = 72

function snapHours(h: number): number {
  if (h <= 24) return Math.max(MIN_HOURS, Math.round(h))
  if (h <= 168) return Math.round(h / 6) * 6
  return Math.round(h / 24) * 24
}
function formatDuration(hours: number): string {
  if (hours < 24) { const h = Math.round(hours); return `${h} hour${h === 1 ? "" : "s"}` }
  const days = hours / 24
  if (days < 14) { const d = Math.round(days); return `${d} day${d === 1 ? "" : "s"}` }
  const w = Math.round(days / 7); return `${w} week${w === 1 ? "" : "s"}`
}

export function CreateMarketSheet({ open, onClose, onCreated }: CreateMarketSheetProps) {
  const [marketType, setMarketType] = useState<MarketType>("yes_no")
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<MarketCategory>("Sports")
  const [durationHours, setDurationHours] = useState(DEFAULT_HOURS)
  const [criteria, setCriteria] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Multiple Choice / Set — manual options
  const [options, setOptions] = useState<string[]>(["", ""])
  // Numeric — range params
  const [numMin, setNumMin] = useState("0")
  const [numMax, setNumMax] = useState("100")
  const [numCount, setNumCount] = useState(4)

  const titleTrimmed = title.trim()
  const isGroup = marketType !== "yes_no"
  const isManualOptions = marketType === "multiple_choice" || marketType === "set" || marketType === "poll"

  // Derived option preview for numeric/date
  const previewOptions: string[] =
    marketType === "numeric" ? numericBuckets(Number(numMin) || 0, Number(numMax) || 100, numCount)
    : marketType === "date"  ? dateBuckets(new Date().toISOString(), new Date(Date.now() + durationHours * 3_600_000).toISOString(), numCount)
    : []

  const manualClean = normalizeOptions(options)

  const titleOk = titleTrimmed.length >= MIN_TITLE && titleTrimmed.length <= MAX_TITLE
  const optionsOk =
    marketType === "yes_no" ? titleTrimmed.endsWith("?")
    : isManualOptions ? manualClean.length >= 2
    : marketType === "numeric" || marketType === "date" ? previewOptions.length >= 2
    : false
  const canSubmit = titleOk && optionsOk && !submitting

  const handleClose = () => {
    if (submitting) return
    setMarketType("yes_no"); setTitle(""); setCategory("Sports"); setDurationHours(DEFAULT_HOURS)
    setCriteria(""); setOptions(["", ""]); setNumMin("0"); setNumMax("100"); setNumCount(4); setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const endTimeIso = new Date(Date.now() + durationHours * 3_600_000).toISOString()

      if (marketType === "yes_no") {
        const res = await fetch("/api/markets", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: titleTrimmed, category, end_time: endTimeIso, ...(criteria.trim() ? { resolution_criteria: criteria.trim() } : {}) }),
        })
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Failed to create market"); return }
        const result = await res.json().catch(() => ({}))
        handleClose(); onCreated(result._review === true); return
      }

      const finalOptions = isManualOptions ? manualClean : previewOptions
      const res = await fetch("/api/markets/group", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: marketType, question: titleTrimmed, category, end_time: endTimeIso, options: finalOptions, ...(criteria.trim() ? { criteria: criteria.trim() } : {}) }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Failed to create market"); return }
      handleClose(); onCreated(false)
    } catch {
      setError("Network error — please try again")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div
        className="fixed bottom-0 inset-x-0 z-50 bg-surface-2 border-t border-border max-h-[92dvh] overflow-y-auto"
        style={{ borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0" }}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-border sticky top-0 bg-surface-2 z-10">
          <span className="text-sm font-semibold text-foreground">New Prediction</span>
          <button onClick={handleClose} disabled={submitting} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-5 space-y-5 pb-safe-or-5">

          {/* Type selector */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setMarketType(t.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 px-1 border text-center transition-all duration-[80ms] active:scale-[0.96]",
                    marketType === t.id
                      ? "bg-accent/15 text-accent border-accent/50"
                      : "bg-surface text-muted-foreground border-border hover:border-muted-foreground/40 hover:text-foreground"
                  )}
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  <span className="text-base font-mono leading-none">{t.icon}</span>
                  <span className="text-[10px] font-semibold leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60">{TYPES.find((t) => t.id === marketType)?.desc}</p>
          </div>

          <>
              {/* Question */}
              <div className="space-y-2">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  {isGroup ? "Question" : "Your question"}
                </label>
                <textarea
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isGroup ? "e.g. Who will win the 2026 World Cup?" : "e.g. Will it snow in LA before 2027?"}
                  maxLength={MAX_TITLE + 10}
                  rows={2}
                  className="w-full bg-surface border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors"
                  style={{ borderRadius: "var(--radius-card)" }}
                  autoFocus
                />
                {marketType === "yes_no" && titleTrimmed.length > 0 && !titleTrimmed.endsWith("?") && (
                  <p className="text-[10px] text-muted-foreground">End with a ?</p>
                )}
              </div>

              {/* Manual options (MC / Set) */}
              {isManualOptions && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    Options <span className="text-muted-foreground/50">({marketType === "set" ? "any can win" : "one wins"})</span>
                  </label>
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={opt}
                        onChange={(e) => setOptions((p) => p.map((o, j) => (j === i ? e.target.value : o)))}
                        placeholder={`Option ${i + 1}`}
                        maxLength={80}
                        className="flex-1 bg-surface border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors"
                        style={{ borderRadius: "var(--radius-button)" }}
                      />
                      {options.length > 2 && (
                        <button onClick={() => setOptions((p) => p.filter((_, j) => j !== i))} aria-label="Remove option" className="p-2 text-muted-foreground/50 hover:text-danger transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {options.length < 12 && (
                    <button onClick={() => setOptions((p) => [...p, ""])} className="w-full py-2 text-[11px] font-semibold border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 flex items-center justify-center gap-1.5 transition-all" style={{ borderRadius: "var(--radius-badge)" }}>
                      <Plus className="w-3.5 h-3.5" /> Add option
                    </button>
                  )}
                </div>
              )}

              {/* Numeric range params */}
              {marketType === "numeric" && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Range</label>
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" value={numMin} onChange={(e) => setNumMin(e.target.value.replace(/[^0-9]/g, ""))} placeholder="min" className="flex-1 bg-surface border border-border px-3 py-2 text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-accent/50" style={{ borderRadius: "var(--radius-button)" }} />
                    <span className="text-muted-foreground text-xs">to</span>
                    <input inputMode="numeric" value={numMax} onChange={(e) => setNumMax(e.target.value.replace(/[^0-9]/g, ""))} placeholder="max" className="flex-1 bg-surface border border-border px-3 py-2 text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-accent/50" style={{ borderRadius: "var(--radius-button)" }} />
                    <select value={numCount} onChange={(e) => setNumCount(Number(e.target.value))} className="bg-surface border border-border px-2 py-2 text-sm text-foreground focus:outline-none" style={{ borderRadius: "var(--radius-button)" }}>
                      {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} buckets</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Date bucket count */}
              {marketType === "date" && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Windows</label>
                  <select value={numCount} onChange={(e) => setNumCount(Number(e.target.value))} className="w-full bg-surface border border-border px-3 py-2 text-sm text-foreground focus:outline-none" style={{ borderRadius: "var(--radius-button)" }}>
                    {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} time windows</option>)}
                  </select>
                </div>
              )}

              {/* Bucket preview for numeric/date */}
              {(marketType === "numeric" || marketType === "date") && previewOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {previewOptions.map((o, i) => (
                    <span key={i} className="text-[11px] font-medium px-2 py-1 bg-surface border border-border text-foreground" style={{ borderRadius: "var(--radius-badge)" }}>{o}</span>
                  ))}
                </div>
              )}

              {/* Category */}
              <div className="space-y-2">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button key={cat} onClick={() => setCategory(cat)} className={cn(
                      "py-2.5 text-xs font-semibold uppercase tracking-wider border flex flex-col items-center gap-1 transition-all duration-[80ms] active:scale-[0.96]",
                      category === cat ? "bg-accent text-accent-foreground border-accent" : "bg-surface text-muted-foreground border-border hover:border-muted-foreground/40 hover:text-foreground"
                    )} style={{ borderRadius: "var(--radius-badge)" }}>
                      <span className="text-base leading-none">{CATEGORY_ICONS[cat]}</span><span>{cat}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Closes in</label>
                  <span className="text-sm font-bold text-accent tabular-nums">{formatDuration(durationHours)}</span>
                </div>
                <input type="range" min={MIN_HOURS} max={MAX_HOURS} step={1} value={durationHours}
                  onChange={(e) => setDurationHours(snapHours(Number(e.target.value)))}
                  className="w-full cursor-pointer" style={{ accentColor: "var(--accent)" }} aria-label="Market duration" />
              </div>

              {/* Criteria */}
              {marketType !== "poll" && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    How will this resolve? <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={2} maxLength={410}
                    placeholder="e.g. Resolves on the official result."
                    className="w-full bg-surface border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors"
                    style={{ borderRadius: "var(--radius-card)" }} />
                </div>
              )}
            </>

          {error && <p className="text-xs text-danger px-1">{error}</p>}

          <button onClick={handleSubmit} disabled={!canSubmit} className={cn(
            "w-full py-3 text-sm font-bold uppercase tracking-wider border transition-all duration-[80ms]",
            canSubmit ? "bg-accent text-accent-foreground border-accent hover:opacity-90 active:scale-[0.97]" : "bg-muted/30 text-muted-foreground border-border cursor-not-allowed"
          )} style={{ borderRadius: "var(--radius-button)" }}>
            {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Creating…</span> : "Post Prediction"}
          </button>
        </div>
      </div>
    </>
  )
}
