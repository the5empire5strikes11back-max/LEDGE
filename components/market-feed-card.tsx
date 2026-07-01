"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import { Clock, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Countdown } from "@/components/ui/countdown"
import { OddsSparkline } from "@/components/ui/odds-sparkline"
import { MarketSocialBar } from "@/components/market-social-bar"
import { UserAvatar } from "@/components/ui/user-avatar"
import { computeMovementSignals, type OddsPoint } from "@/lib/odds-history"
import type { MarketSocialData } from "@/lib/social-signals"
import type { CompoundState } from "@/lib/feed-signals"
import { getResolutionMeta } from "@/lib/resolution-label"
import { isLive, formatTimeLeft } from "@/lib/market-live"
import { payoutMultiplier } from "@/lib/game-engine"

interface FriendBet {
  username: string
  avatarUrl: string | null
  side: string
}

type MarketCategory = "Sports" | "Politics" | "Culture" | "Tech" | "Viral" | "Wild" | "Circle"

interface MarketFeedCardProps {
  id: string
  title: string
  category: MarketCategory
  endTime: Date
  yesPercent: number
  yesPool: number
  noPool: number
  totalCredits: number
  hotScore?: number
  momentumShift?: number
  isFeatured?: boolean
  isNearMiss?: boolean
  oddsHistory?: OddsPoint[]
  /** Increments each time history is updated — invalidates memoized signals */
  oddsVersion?: number
  social?: MarketSocialData | null
  userBet?: { side: "yes" | "no"; amount: number }
  resolved?: { winner: "yes" | "no" }
  /** Settled with no winner — outcome couldn't be verified, all stakes refunded. */
  voided?: boolean
  className?: string
  /** Pulse the YES/NO buttons for first-time onboarding hint */
  pulseCTA?: boolean
  /** First-session spotlight: pulsing ring + "Popular right now" badge */
  isSpotlight?: boolean
  /** Cross-system compound market state — drives badge + glow intensity */
  compoundState?: CompoundState
  /** Username of who created this market; null for AI-generated */
  creatorUsername?: string | null
  /** Followed users who have bet on this market */
  friendBets?: FriendBet[]
  /**
   * AI-set opening probability (derived from virtual pools at generation time).
   * When yesPercent equals this and totalCredits === 0, we show "AI est." to
   * signal the odds haven't been moved by real bets yet.
   */
  openingYesPercent?: number
  /** Resolution source URL — drives the "Resolves via …" chip */
  resolutionSourceUrl?: string | null
  /** 'creator' = subjective market the creator settles (disclosed before betting) */
  resolutionMode?: "auto" | "creator"
  /** Raw JSON resolution key — used to derive source label & type */
  targetDataKey?: string | null
  /** User-coined category label shown in place of the system category */
  subcategory?: string | null
  style?: React.CSSProperties
  onClick?: () => void
  onBuyYes?: () => void
  onBuyNo?: () => void
}

const categoryLabel: Record<MarketCategory, string> = {
  Sports:   "Sports",
  Politics: "Politics",
  Culture:  "Culture",
  Tech:     "Tech",
  Viral:    "Viral",
  Wild:     "Wild",
  Circle:   "Circle",
}


function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

function AnimatedNumber({
  value,
  className,
  suffixClassName,
  suffix,
  flashOnChange = false,
}: {
  value: number
  className?: string
  /** Optional suffix rendered inline after the number (e.g. "%") */
  suffix?: string
  suffixClassName?: string
  /** When true, briefly highlight the number green/red when it ticks up/down */
  flashOnChange?: boolean
}) {
  const [displayValue, setDisplayValue] = useState(value)
  const [flashDir, setFlashDir] = useState<"up" | "down" | null>(null)
  const prevValue = useRef(value)

  useEffect(() => {
    if (value === prevValue.current) return
    const dir = value > prevValue.current ? "up" : "down"
    const start = prevValue.current
    const end = value
    const duration = 500
    const startTime = performance.now()
    const animate = (time: number) => {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(start + (end - start) * eased)
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
    prevValue.current = value

    if (flashOnChange) {
      setFlashDir(dir)
      const t = setTimeout(() => setFlashDir(null), 800)
      return () => clearTimeout(t)
    }
  }, [value, flashOnChange])

  return (
    <span
      className={cn(
        "font-mono tabular-nums transition-colors duration-300",
        flashOnChange && flashDir === "up"   && "text-success",
        flashOnChange && flashDir === "down" && "text-danger",
        className
      )}
    >
      {Math.round(displayValue)}{suffix && <span className={cn("not-italic", suffixClassName)}>{suffix}</span>}
    </span>
  )
}

// ── Volatility glow class ─────────────────────────────────────────────────────

function volatilityGlowClass(
  volatility: "calm" | "moving" | "volatile" | "surging",
  trend: "up" | "down" | "flat"
): string {
  if (volatility === "calm" || volatility === "moving") return ""
  const dir = trend === "up" ? "yes" : trend === "down" ? "no" : "neutral"
  return `market-${volatility}-${dir}`
}

// ── Live dot ─────────────────────────────────────────────────────────────────

function LiveDot({ volatility }: { volatility: "calm" | "moving" | "volatile" | "surging" }) {
  if (volatility === "calm") return null
  const dotClass =
    volatility === "surging" ? "live-dot-surging bg-accent" :
    volatility === "volatile" ? "live-dot-volatile bg-accent" :
    "live-dot-moving bg-accent/60"

  return (
    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotClass)} />
  )
}

// ── Movement label ────────────────────────────────────────────────────────────

function MovementLabel({
  label,
  trend,
  volatility,
}: {
  label: string | null
  trend: "up" | "down" | "flat"
  volatility: "calm" | "moving" | "volatile" | "surging"
}) {
  if (!label || volatility === "calm") return null

  const textColor =
    trend === "up"   ? "text-success/80" :
    trend === "down" ? "text-danger/80"  : "text-accent/80"

  return (
    <span className={cn("text-[10px] font-medium font-mono shrink-0 truncate", textColor)}>
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Compound state badge config ───────────────────────────────────────────────

const COMPOUND_BADGE: Record<
  Exclude<CompoundState, "normal" | "moving" | "hot">,
  { label: string; className: string }
> = {
  surging:     { label: "Surging",   className: "text-review bg-review/10 border-review/20 animate-pulse" },
  "whale-zone":{ label: "Whale",    className: "text-featured bg-featured/10 border-featured/20" },
  contested:   { label: "Contested", className: "text-foreground bg-muted/50 border-border" },
}

export function MarketFeedCard({
  title,
  category,
  endTime,
  yesPercent,
  yesPool,
  noPool,
  totalCredits,
  hotScore = 0,
  momentumShift = 0,
  isFeatured = false,
  isNearMiss = false,
  oddsHistory = [],
  oddsVersion = 0,
  social = null,
  userBet,
  resolved,
  voided = false,
  className,
  pulseCTA = false,
  isSpotlight = false,
  compoundState = "normal",
  creatorUsername = null,
  friendBets,
  openingYesPercent,
  resolutionSourceUrl,
  resolutionMode,
  targetDataKey,
  subcategory,
  style,
  onClick,
  onBuyYes,
  onBuyNo,
}: MarketFeedCardProps) {
  const isHot = hotScore >= 8
  const noPercent = 100 - yesPercent
  const hasUserBet = !!userBet
  const isResolved = !!resolved
  const totalPool = yesPool + noPool
  // "Crowd odds" once any real credits have been wagered; "AI est." before that.
  const isCrowdOdds = totalCredits > 0
  // Resolution source metadata — drives "Resolves via …" and "Auto-resolved ✓" chips
  const resMeta = getResolutionMeta(resolutionSourceUrl, targetDataKey)
  // Live / in-play: event is happening right now (end_time ≤ 4h away)
  const isLiveNow = !isResolved && isLive(endTime)
  // Closed but not yet settled — the event is over and we're waiting on the
  // result (or the grace window before void). Not bettable; shows "Awaiting result".
  const isAwaitingResult = !isResolved && !voided && endTime.getTime() <= Date.now()

  // Headline = the chance the answer is YES (i.e. the thing in the question
  // happens), exactly like Polymarket/Kalshi. One number, one meaning, never
  // flips to the other side — so "Will Scotland win? 31%" reads as "31% chance".
  // Kept neutral (no red/green) so the number never contradicts the bar/buttons.
  const dominantValue      = yesPercent
  const dominantLabel      = "CHANCE"
  const dominantColor      = "text-foreground"
  const dominantLabelColor = "text-muted-foreground/50"

  const isWin  = isResolved && userBet && resolved.winner === userBet.side
  const isLoss = isResolved && userBet && resolved.winner !== userBet.side

  // Compute movement signals — memoized, invalidated by oddsVersion counter
  // (oddsHistory is a mutable ref array; its reference never changes)
  const signals = useMemo(
    () => computeMovementSignals(oddsHistory),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oddsVersion, yesPercent] // oddsVersion bumps whenever new points are pushed
  )

  const { trend, volatility, label: movementLabel } = signals
  const glowClass = !isResolved ? volatilityGlowClass(volatility, trend) : ""

  // Show movement row only when we have real history to show
  const hasMovement = oddsHistory.length >= 2 && (movementLabel !== null || volatility !== "calm")

  return (
    <div
      style={{ borderRadius: "var(--radius-card)", ...style }}
      className={cn(
        "relative bg-surface-2 border overflow-hidden w-full card-lift",
        // Spotlight: slow-pulse ring for first-session
        isSpotlight && !isResolved && "ring-2 ring-accent/40 ring-offset-1 ring-offset-background",
        // Featured: subtle left accent
        isFeatured && !isResolved && "border-border border-l-2 border-l-accent",
        // Default / hot
        !isFeatured && !isResolved && "border-border",
        // Resolved positions
        isWin  && "border-l-2 border-l-success",
        isLoss && "border-l-2 border-l-danger opacity-75",
        // Open position (not resolved)
        hasUserBet && !isResolved && !isWin && !isLoss && "border-l-2 border-l-accent",
        // Volatility glow (overrides default border-color on the shadow only)
        glowClass,
        className
      )}
    >
      {/* Spotlight banner */}
      {isSpotlight && !isResolved && (
        <div className="px-5 pt-4 pb-0">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-accent/10 border border-accent/25 text-[10px] font-bold text-accent uppercase tracking-wider"
            style={{ borderRadius: "var(--radius-badge)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Popular right now
          </span>
        </div>
      )}

      <div className="p-5 flex flex-col gap-4">

        {/* Row 1: Category · live signals · time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium shrink-0">
              {subcategory || categoryLabel[category]}
            </span>

            {/* 🔴 LIVE chip — event happening right now */}
            {isLiveNow && (
              <span
                className="inline-flex items-center gap-1 shrink-0 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-red-500/15 text-red-400 border border-red-500/25"
                style={{ borderRadius: "var(--radius-badge)" }}
              >
                <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                LIVE
              </span>
            )}

            {/* Live dot — shown during movement (non-live markets) */}
            {!isResolved && !isLiveNow && <LiveDot volatility={volatility} />}

            {/* Compound state badge — excludes "hot" (already shown via live dot + glow) */}
            {!isResolved && compoundState !== "normal" && compoundState !== "moving" && compoundState !== "hot" && (
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border shrink-0",
                  COMPOUND_BADGE[compoundState as keyof typeof COMPOUND_BADGE]?.className
                )}
                style={{ borderRadius: "var(--radius-badge)" }}
              >
                {COMPOUND_BADGE[compoundState as keyof typeof COMPOUND_BADGE]?.label}
              </span>
            )}

            {/* Moving state: just show the momentum number */}
            {!isResolved && compoundState === "moving" && momentumShift >= 3 && (
              <span className="text-[10px] text-accent font-mono shrink-0">
                ↑{momentumShift.toFixed(1)}%
              </span>
            )}

            {/* Fallback: show momentum when compound is "normal" but shift is meaningful */}
            {!isResolved && compoundState === "normal" && momentumShift >= 3 && !hasMovement && (
              <span className="text-[10px] text-accent font-mono shrink-0">
                ↑{momentumShift.toFixed(1)}%
              </span>
            )}
          </div>

          {isResolved ? (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5",
                  resolved.winner === "yes" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                )}
                style={{ borderRadius: "var(--radius-badge)" }}
              >
                {resolved.winner === "yes" ? "YES Won" : "NO Won"}
              </span>
              {resMeta.label && (
                <span className="text-[9px] text-muted-foreground/50 font-mono">
                  ✓ {resMeta.label}
                </span>
              )}
            </div>
          ) : voided ? (
            /* Settled with no winner — outcome unverifiable, stakes refunded */
            <span
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-muted text-muted-foreground shrink-0"
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              ↩︎ Refunded
            </span>
          ) : isAwaitingResult ? (
            /* Closed, settlement pending — event over, waiting on the result */
            <span
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-review/12 text-review shrink-0"
              style={{ borderRadius: "var(--radius-badge)" }}
            >
              <Clock className="w-2.5 h-2.5" aria-hidden />
              Awaiting result
            </span>
          ) : isLiveNow ? (
            /* Live markets: show red ticking time instead of generic countdown */
            <span className="text-[10px] font-mono font-bold text-red-400 shrink-0 tabular-nums">
              {formatTimeLeft(endTime)} left
            </span>
          ) : (
            <Countdown endTime={endTime} />
          )}
        </div>

        {/* Row 2: [Price column] [Title] */}
        <button onClick={onClick} className="flex items-start gap-4 text-left w-full group">

          {/* Price column: dominant% + label + sparkline stacked */}
          <div className="shrink-0 flex flex-col items-center w-[68px] gap-0.5">
            {/* Leading probability — shows WINNING side's number + % inline */}
            <AnimatedNumber
              value={dominantValue}
              flashOnChange={isLiveNow}
              suffix="%"
              suffixClassName="text-xl font-black"
              className={cn(
                "font-black leading-none",
                dominantValue >= 100 || dominantValue <= 0 ? "text-3xl" : "text-4xl",
                dominantColor
              )}
            />
            {/* Side label — YES / NO / 50/50 matching the number above */}
            <span className={cn(
              "text-[9px] font-medium uppercase tracking-widest",
              dominantLabelColor
            )}>
              {dominantLabel}
            </span>

            {/* Sparkline — lives directly below the percentage */}
            {!isResolved && (
              <OddsSparkline
                points={oddsHistory}
                trend={trend}
                width={56}
                height={22}
              />
            )}

            {/* Source confidence label — flips from "AI est." to "Crowd" once
                real bets arrive, giving users a Polymarket-style trust signal */}
            {!isResolved && (
              <span className={cn(
                "text-[8px] font-bold uppercase tracking-widest leading-none mt-0.5",
                isCrowdOdds ? "text-accent/50" : "text-muted-foreground"
              )}>
                {isCrowdOdds ? "Crowd" : "AI est."}
              </span>
            )}
          </div>

          {/* Question + creator attribution */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-[15px] font-semibold text-foreground leading-snug group-hover:text-accent transition-colors line-clamp-3">
              {title}
            </h3>
            {creatorUsername && (
              <p className="text-[10px] text-muted-foreground/40 mt-1 font-mono">
                @{creatorUsername}
              </p>
            )}
          </div>
        </button>

        {/* Row 3: YES/NO odds bar */}
        <div className="relative h-1.5 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
          <div
            className="absolute inset-y-0 left-0 bg-success transition-all duration-500 ease-out"
            style={{ width: `${yesPercent}%` }}
          />
        </div>

        {/* Row 3b: Movement label — only when there's real activity to show */}
        {!isResolved && hasMovement && (
          <div className="flex items-center gap-2 -mt-1">
            <MovementLabel label={movementLabel} trend={trend} volatility={volatility} />
          </div>
        )}

        {/* Row 3c: Social activity signals */}
        {!isResolved && (
          <MarketSocialBar
            social={social}
            yesPercent={yesPercent}
            momentumShift={momentumShift}
            className="-mt-1"
          />
        )}

        {/* Row 3d: Friend bets — "Your friends called YES" avatar strip */}
        {!isResolved && friendBets && friendBets.length > 0 && (
          <div className="flex items-center gap-2 -mt-1">
            {/* Avatar stack */}
            <div className="flex -space-x-1.5">
              {friendBets.slice(0, 3).map((fb) => (
                <div key={fb.username} className="relative ring-1 ring-background rounded-full">
                  <UserAvatar username={fb.username} avatarUrl={fb.avatarUrl} size={18} />
                </div>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground leading-none">
              {friendBets.length === 1
                ? <><span className="text-foreground font-medium">@{friendBets[0].username}</span> bet {friendBets[0].side.toUpperCase()}</>
                : friendBets.every((fb) => fb.side === friendBets[0].side)
                  ? <><span className="text-foreground font-medium">{friendBets.length} friends</span> all bet {friendBets[0].side.toUpperCase()}</>
                  : <><span className="text-foreground font-medium">{friendBets.length} friends</span> already in</>
              }
            </span>
          </div>
        )}

        {/* Row 4: Trade buttons — hidden once you've bet (then the position shows) */}
        {!isResolved && !isAwaitingResult && !voided && !hasUserBet && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onBuyYes}
              className={cn(
                "flex flex-col items-center justify-center py-3 px-4 gap-0.5",
                "bg-success hover:bg-success/90",
                "active:scale-[0.96] transition-all duration-[80ms] ease-[var(--ease-sharp)]",
                pulseCTA && "ring-2 ring-success/50 animate-pulse"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <span className="text-[12px] font-black text-black uppercase tracking-wide">YES</span>
              <span className="font-mono text-[9px] text-black/60 leading-none">
                {payoutMultiplier(yesPercent)}
              </span>
            </button>

            <button
              onClick={onBuyNo}
              className={cn(
                "flex flex-col items-center justify-center py-3 px-4 gap-0.5",
                "bg-danger hover:bg-danger/90",
                "active:scale-[0.96] transition-all duration-[80ms] ease-[var(--ease-sharp)]",
                pulseCTA && "ring-2 ring-danger/50 animate-pulse"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <span className="text-[12px] font-black text-foreground uppercase tracking-wide">NO</span>
              <span className="font-mono text-[9px] text-foreground/60 leading-none">
                {payoutMultiplier(noPercent)}
              </span>
            </button>
          </div>
        )}

        {/* Open position — once you've bet, the card tracks your position instead
            of the buttons. These markets live on the feed's "Mine" tab. */}
        {hasUserBet && !isResolved && (
          <div
            className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 border border-border"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Your call</span>
              <p className={cn(
                "text-xs font-mono font-bold mt-0.5",
                userBet!.side === "yes" ? "text-success" : "text-danger"
              )}>
                {userBet!.side.toUpperCase()} · {formatCredits(userBet!.amount)} CR
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Now</span>
              <p className="text-xs font-mono font-bold mt-0.5 text-foreground">
                {(userBet!.side === "yes" ? yesPercent : noPercent).toFixed(0)}%
              </p>
            </div>
          </div>
        )}

        {/* Resolved position */}
        {hasUserBet && isResolved && isWin && (
          <div
            className="flex items-center justify-between px-3 py-2 border bg-success/8 border-success/20"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <span className="text-xs font-bold uppercase tracking-wide text-success">✓ Called it</span>
            <span className="text-xs font-mono font-bold text-success">
              +{formatCredits(userBet!.amount)} CR
            </span>
          </div>
        )}

        {/* Loss reframe — softer, motivational */}
        {hasUserBet && isResolved && isLoss && (
          <div
            className="flex flex-col gap-1.5 px-3 py-2.5 border bg-surface border-border/60"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-medium">
                Market resolved {resolved!.winner.toUpperCase()}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                −{formatCredits(userBet!.amount)} CR
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/60 leading-snug">
              You called {userBet!.side.toUpperCase()}. The market saw it differently. Back tomorrow →
            </p>
          </div>
        )}

        {/* Near-miss */}
        {isNearMiss && isResolved && (
          <p className="text-[10px] text-muted-foreground">
            Settled at {yesPercent.toFixed(1)}% — resolved within 10% margin
          </p>
        )}

        {/* Footer: source chip + volume + details link */}
        <div className="flex items-center gap-3 pt-2 border-t border-border/50">
          {/* Resolution trust signal: creator-settled (disclosed) vs auto on official data */}
          {!isResolved && resolutionMode === "creator" ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 shrink-0">
              <span aria-hidden>👤</span> Creator-resolved
            </span>
          ) : !isResolved && resMeta.label && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70 shrink-0">
              <ShieldCheck className={cn("w-3 h-3 shrink-0", resMeta.isAuto ? "text-success/70" : "text-muted-foreground/40")} aria-hidden />
              {resMeta.label}
            </span>
          )}

          {totalCredits > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground/50">
              {formatCredits(totalCredits)} CR vol
            </span>
          )}
          {hotScore >= 5 && (
            <span className="text-[10px] font-mono text-muted-foreground/50">
              {hotScore} trades
            </span>
          )}
          {onClick && (
            <button
              onClick={onClick}
              className="ml-auto text-[10px] text-muted-foreground/40 hover:text-accent active:scale-[0.94] transition-all duration-[80ms] ease-[var(--ease-sharp)]"
            >
              Details →
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
