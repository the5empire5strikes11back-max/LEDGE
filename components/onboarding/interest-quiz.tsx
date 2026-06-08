"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { INTEREST_OPTIONS, type InterestOption } from "@/lib/interest-tags"

// ── Types ─────────────────────────────────────────────────────────────────────

interface InterestQuizProps {
  onComplete: (selectedIds: string[]) => void
  onSkip: () => void
  isSubmitting?: boolean
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS: Array<{
  heading: string
  sub: string
  groups: string[]
}> = [
  {
    groups: ['sports'],
    heading: 'Pick your sports',
    sub: 'We\'ll fill your feed with markets you actually care about.',
  },
  {
    groups: ['culture', 'politics'],
    heading: 'What else are you into?',
    sub: 'Mix in culture and politics to keep things interesting.',
  },
]

// ── Sub-component: single interest card ──────────────────────────────────────

function InterestCard({
  option,
  selected,
  onToggle,
}: {
  option: InterestOption
  selected: boolean
  onToggle: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(option.id)}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 p-4 border transition-all",
        "text-center cursor-pointer select-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        selected
          ? "bg-accent/10 border-accent text-foreground"
          : "bg-card border-border text-muted-foreground hover:border-border/80 hover:bg-muted/30"
      )}
      style={{ borderRadius: "var(--radius-button)" }}
      aria-pressed={selected}
    >
      {selected && (
        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
          <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2.5">
            <path
              d="M1 4l3 3 5-6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent-foreground"
            />
          </svg>
        </span>
      )}
      <span className="text-2xl leading-none">{option.emoji}</span>
      <span className="text-xs font-medium leading-tight">{option.label}</span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function InterestQuiz({ onComplete, onSkip, isSubmitting = false }: InterestQuizProps) {
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const currentStep = STEPS[step]
  const visibleOptions = INTEREST_OPTIONS.filter((o) => currentStep.groups.includes(o.group))

  const isLastStep = step === STEPS.length - 1

  function toggleInterest(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleNext() {
    if (isLastStep) {
      onComplete(Array.from(selected))
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={cn(
              "rounded-full transition-all",
              i === step
                ? "w-5 h-1.5 bg-accent"
                : i < step
                ? "w-1.5 h-1.5 bg-accent/50"
                : "w-1.5 h-1.5 bg-border"
            )}
          />
        ))}
      </div>

      {/* Heading */}
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight">{currentStep.heading}</h2>
        <p className="text-sm text-muted-foreground mt-1">{currentStep.sub}</p>
      </div>

      {/* Interest grid */}
      <div className="grid grid-cols-3 gap-2.5">
        {visibleOptions.map((option) => (
          <InterestCard
            key={option.id}
            option={option}
            selected={selected.has(option.id)}
            onToggle={toggleInterest}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleNext}
          disabled={isSubmitting}
          className={cn(
            "w-full bg-accent text-accent-foreground font-semibold py-3 text-sm uppercase tracking-wider",
            "hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          style={{ borderRadius: "var(--radius-button)" }}
        >
          {isSubmitting
            ? "Saving…"
            : isLastStep
            ? selected.size === 0 ? "Skip" : "Done"
            : "Next →"}
        </button>

        {!isLastStep && (
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}
