"use client"

import { cn } from "@/lib/utils"
import type { CreatorMarket } from "@/app/api/creator/markets/route"

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = "Sports" | "Politics" | "Culture"
const CATEGORIES: Category[] = ["Sports", "Politics", "Culture"]

interface CategoryStats {
  cat: Category
  count: number
  totalBets: number
  avgBets: number
  liveCount: number
  reviewCount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function statusLabel(status: CreatorMarket["status"]): {
  text: string
  className: string
} {
  switch (status) {
    case "live":     return { text: "Live",     className: "text-success bg-success/10 border-success/20" }
    case "review":   return { text: "Review",   className: "text-review bg-review/10 border-review/20" }
    case "queued":   return { text: "Queued",   className: "text-muted-foreground bg-muted/20 border-border" }
    case "archived": return { text: "Archived", className: "text-muted-foreground/50 bg-muted/10 border-border/50" }
  }
}

/**
 * Derive one insight line from the creator's market history.
 * Returns null if there's not enough data to say anything useful.
 */
function deriveInsight(
  markets: CreatorMarket[],
  catStats: CategoryStats[]
): string | null {
  const live = markets.filter((m) => m.status === "live")
  if (live.length < 2) return null

  // Best category by avg bets
  const withBets = catStats.filter((c) => c.count >= 2)
  const bestCat = withBets.sort((a, b) => b.avgBets - a.avgBets)[0]

  // Review rate improving? Compare last 3 vs earlier
  const recent = markets.slice(0, 3)
  const earlier = markets.slice(3)
  const recentReviewRate =
    recent.length > 0
      ? recent.filter((m) => m.status === "review").length / recent.length
      : 0
  const earlierReviewRate =
    earlier.length > 0
      ? earlier.filter((m) => m.status === "review").length / earlier.length
      : 0

  if (recentReviewRate < earlierReviewRate - 0.15 && earlier.length >= 2) {
    return "Your recent questions are being approved more often. Keep it up."
  }

  if (bestCat && bestCat.avgBets > 2) {
    return `Your ${bestCat.cat} markets tend to attract the most bets.`
  }

  const highEngagement = live.filter((m) => m.hot_score >= 5)
  if (highEngagement.length > 0 && live.length > 0) {
    const pct = Math.round((highEngagement.length / live.length) * 100)
    if (pct >= 50) {
      return `${pct}% of your markets have attracted real engagement.`
    }
  }

  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CreatorAnalyticsProps {
  markets: CreatorMarket[]
}

export function CreatorAnalytics({ markets }: CreatorAnalyticsProps) {
  if (markets.length === 0) return null

  // ── Aggregate metrics ──────────────────────────────────────────────────────

  const liveMarkets = markets.filter((m) => m.status === "live")
  const reviewMarkets = markets.filter((m) => m.status === "review")
  const totalBets = markets.reduce((s, m) => s + m.hot_score, 0)
  const totalVolume = markets.reduce((s, m) => s + m.total_credits, 0)
  const resolvedMarkets = markets.filter((m) => m.resolved)

  // Best-performing market (most bets)
  const bestMarket = liveMarkets.length > 0
    ? liveMarkets.reduce((best, m) => m.hot_score > best.hot_score ? m : best, liveMarkets[0])
    : null

  // ── Category stats ─────────────────────────────────────────────────────────

  const catStats: CategoryStats[] = CATEGORIES.map((cat) => {
    const catMarkets = markets.filter((m) => m.category === cat)
    const liveCat = catMarkets.filter((m) => m.status === "live")
    const reviewCat = catMarkets.filter((m) => m.status === "review")
    const totalBetsCat = catMarkets.reduce((s, m) => s + m.hot_score, 0)
    return {
      cat,
      count: catMarkets.length,
      totalBets: totalBetsCat,
      avgBets: catMarkets.length > 0 ? totalBetsCat / catMarkets.length : 0,
      liveCount: liveCat.length,
      reviewCount: reviewCat.length,
    }
  }).filter((c) => c.count > 0)

  const maxAvgBets = Math.max(...catStats.map((c) => c.avgBets), 1)
  const insight = deriveInsight(markets, catStats)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="bg-card border border-border overflow-hidden"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Markets Made
        </span>
        <span className="text-xs font-mono text-muted-foreground">
          {markets.length} total
        </span>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Summary stat chips */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Live",      value: liveMarkets.length,   color: "text-success" },
            { label: "Bets In",   value: totalBets,             color: "text-foreground" },
            { label: "Vol",       value: `${formatNumber(totalVolume)} CR`, color: "text-foreground" },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-surface border border-border px-2 py-2.5 text-center"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <span className={cn("text-base font-bold font-mono tabular-nums block", color)}>
                {value}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5 block">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Review pending note */}
        {reviewMarkets.length > 0 && (
          <p className="text-[10px] text-muted-foreground/70 -mt-1">
            {reviewMarkets.length} market{reviewMarkets.length !== 1 ? "s" : ""} pending review — they'll appear in the feed once approved.
          </p>
        )}

        {/* Category performance bars — only when ≥2 categories have data */}
        {catStats.length >= 2 && (
          <div className="space-y-2.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Engagement by Category
            </span>
            {catStats.map(({ cat, count, avgBets, liveCount }) => {
              const barPct = maxAvgBets > 0 ? (avgBets / maxAvgBets) * 100 : 0
              const isTop = avgBets === maxAvgBets && avgBets > 0
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-foreground font-medium">{cat}</span>
                      <span className="text-[9px] text-muted-foreground/60">
                        {liveCount}/{count} live
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isTop && avgBets > 1 && (
                        <span className="text-[9px] text-accent font-semibold uppercase tracking-wider">top</span>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                        {avgBets.toFixed(1)} avg bets
                      </span>
                    </div>
                  </div>
                  <div className="relative h-1 bg-muted overflow-hidden" style={{ borderRadius: "9999px" }}>
                    <div
                      className={cn("absolute inset-y-0 left-0 transition-all duration-700", isTop ? "bg-accent" : "bg-accent/40")}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Insight copy */}
        {insight && (
          <div className="flex items-start gap-2 px-3 py-2 bg-accent/5 border border-accent/15 rounded-sm">
            <span className="text-accent text-xs shrink-0 mt-px">→</span>
            <p className="text-[11px] text-muted-foreground leading-snug">{insight}</p>
          </div>
        )}

        {/* Per-market list — capped at 5 most recent, sorted by bets desc then recency */}
        {liveMarkets.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Your Markets
            </span>
            <div
              className="overflow-hidden border border-border divide-y divide-border"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              {[...markets]
                .sort((a, b) => b.hot_score - a.hot_score || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 5)
                .map((market) => {
                  const badge = statusLabel(market.status)
                  const isResolved = market.resolved
                  return (
                    <div key={market.id} className="px-3 py-2.5 flex items-start gap-3">
                      {/* Engagement dot */}
                      <div className="shrink-0 mt-1 w-5 text-center">
                        <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums">
                          {market.hot_score > 0 ? market.hot_score : "—"}
                        </span>
                      </div>

                      {/* Title */}
                      <p className="flex-1 text-[11px] text-foreground leading-snug line-clamp-2 min-w-0">
                        {market.title}
                      </p>

                      {/* Right: status + resolved */}
                      <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5">
                        <span
                          className={cn(
                            "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border",
                            badge.className
                          )}
                          style={{ borderRadius: "var(--radius-badge)" }}
                        >
                          {badge.text}
                        </span>
                        {isResolved && (
                          <span className={cn(
                            "text-[9px] font-mono",
                            market.winner ? "text-success" : "text-muted-foreground"
                          )}>
                            {market.winner === "yes" ? "YES" : market.winner === "no" ? "NO" : "resolved"}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
            {/* Legend for leftmost column */}
            <p className="text-[9px] text-muted-foreground/40 pl-1">
              # = bets received
            </p>
          </div>
        )}

        {/* Best market callout — only when there's a clear winner */}
        {bestMarket && bestMarket.hot_score >= 3 && liveMarkets.length >= 2 && (
          <div className="flex items-start gap-2">
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider shrink-0 mt-0.5">Best</span>
            <p className="text-[11px] text-foreground font-medium leading-snug line-clamp-2 flex-1">
              {bestMarket.title}
            </p>
            <span className="font-mono text-[11px] text-accent font-bold shrink-0">
              {bestMarket.hot_score} bets
            </span>
          </div>
        )}

        {/* Resolved count — only if meaningful */}
        {resolvedMarkets.length > 0 && (
          <p className="text-[10px] text-muted-foreground/60">
            {resolvedMarkets.length} market{resolvedMarkets.length !== 1 ? "s" : ""} resolved
          </p>
        )}
      </div>
    </div>
  )
}
