"use client"

import { useState } from "react"
import { Check, ChevronDown, ChevronUp, Zap, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { OnboardingState } from "@/lib/onboarding"

interface GettingStartedChecklistProps {
  ob: OnboardingState
  onOpenBet: () => void
  onOpenDailyDrop: () => void
  onOpenCreate: () => void
}

export function GettingStartedChecklist({
  ob,
  onOpenBet,
  onOpenDailyDrop,
  onOpenCreate,
}: GettingStartedChecklistProps) {
  const [collapsed, setCollapsed] = useState(false)

  const steps = [
    {
      label: "Place your first bet",
      done: ob.firstBetAchievementDone,
      onTap: onOpenBet,
    },
    {
      label: "Claim your daily drop",
      done: ob.dailyDropClaimed,
      onTap: onOpenDailyDrop,
    },
    {
      label: "Create a prediction",
      done: ob.firstMarketCreated,
      onTap: onOpenCreate,
    },
  ]

  const doneCount = steps.filter((s) => s.done).length

  if (doneCount === steps.length) return null

  return (
    <div
      className="mx-4 mb-2 border border-accent/25 bg-accent/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 gap-2"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-accent shrink-0" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
            Getting started
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground">
            {doneCount}/{steps.length}
          </span>
          {collapsed
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
            : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
          }
        </div>
      </button>

      {!collapsed && (
        <div className="px-3.5 pb-3 flex flex-col gap-2.5 border-t border-accent/15 pt-2.5">
          {steps.map((step, i) => (
            <button
              key={i}
              onClick={step.done ? undefined : step.onTap}
              disabled={step.done}
              className={cn(
                "flex items-center gap-2.5 text-left w-full group",
                !step.done && "cursor-pointer"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                  step.done
                    ? "bg-success border-success"
                    : "border-muted-foreground/40 group-hover:border-accent/60"
                )}
              >
                {step.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </div>
              <span
                className={cn(
                  "text-xs flex-1",
                  step.done
                    ? "text-muted-foreground/60 line-through"
                    : "text-foreground font-medium"
                )}
              >
                {step.label}
              </span>
              {!step.done && (
                <ArrowRight className="w-3 h-3 text-muted-foreground/50 group-hover:text-accent transition-colors shrink-0" aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
