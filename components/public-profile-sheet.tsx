"use client"

import { useEffect, useState, useCallback } from "react"
import { X, Zap, UserPlus, UserCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/ui/user-avatar"
import { AchievementsGrid } from "@/components/achievements-grid"
import { RANKS, type RankKey } from "@/components/user-profile-card"
import { xpProgress } from "@/lib/game-engine"
import type { Achievement } from "@/lib/achievements"
import type { Persona } from "@/lib/game-engine"

interface PublicProfile {
  username:        string
  avatar_url:      string | null
  rank:            RankKey
  xp:              number
  streak:          number
  is_plus:         boolean
  win_rate:        number
  total_bets:      number
  best_streak:     number
  persona:         Persona
  achievements:    Achievement[]
  recent_bets: Array<{
    market_title: string
    side:         string
    won:          boolean | null
    created_at:   string
  }>
  followers_count: number
  following_count: number
  is_following:    boolean
  is_self:         boolean
}

interface PublicProfileSheetProps {
  username: string | null
  onClose:  () => void
}

export function PublicProfileSheet({ username, onClose }: PublicProfileSheetProps) {
  const [profile,        setProfile]        = useState<PublicProfile | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [followLoading,  setFollowLoading]  = useState(false)
  const [isFollowing,    setIsFollowing]    = useState(false)
  const [followersCount, setFollowersCount] = useState(0)

  useEffect(() => {
    if (!username) { setProfile(null); setError(null); return }
    setLoading(true)
    setError(null)
    setProfile(null)
    fetch(`/api/users/${encodeURIComponent(username)}`)
      .then((r) => r.json())
      .then((data: PublicProfile & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setProfile(data)
        setIsFollowing(data.is_following)
        setFollowersCount(data.followers_count)
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false))
  }, [username])

  const handleFollow = useCallback(async () => {
    if (!username || followLoading) return
    setFollowLoading(true)
    // Optimistic update
    const wasFollowing = isFollowing
    setIsFollowing(!wasFollowing)
    setFollowersCount((c) => wasFollowing ? c - 1 : c + 1)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/follow`, { method: 'POST' })
      if (!res.ok) {
        // Revert on error
        setIsFollowing(wasFollowing)
        setFollowersCount((c) => wasFollowing ? c + 1 : c - 1)
      }
    } catch {
      setIsFollowing(wasFollowing)
      setFollowersCount((c) => wasFollowing ? c + 1 : c - 1)
    } finally {
      setFollowLoading(false)
    }
  }, [username, followLoading, isFollowing])

  if (!username) return null

  const rankInfo = profile ? RANKS[profile.rank] : null
  const progress = profile ? xpProgress(profile.xp) : null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-surface-2 border-t border-border max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300"
        style={{ borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-10">

          {loading && (
            <div className="flex flex-col gap-3 pt-4">
              <div className="h-20 bg-surface animate-pulse" style={{ borderRadius: "var(--radius-card)" }} />
              <div className="h-14 bg-surface animate-pulse" style={{ borderRadius: "var(--radius-card)" }} />
              <div className="h-28 bg-surface animate-pulse" style={{ borderRadius: "var(--radius-card)" }} />
            </div>
          )}

          {error && (
            <div className="py-10 text-center text-sm text-muted-foreground">{error}</div>
          )}

          {profile && rankInfo && progress && (
            <div className="flex flex-col gap-4 pt-3">

              {/* Header */}
              <div className="flex items-center gap-3">
                <UserAvatar username={profile.username} avatarUrl={profile.avatar_url} size={54} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground">@{profile.username}</span>
                    {profile.is_plus && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 bg-accent/15 text-accent border border-accent/30 uppercase tracking-wider"
                        style={{ borderRadius: "var(--radius-badge)" }}
                      >
                        PLUS
                      </span>
                    )}
                    {profile.streak > 0 && (
                      <span className="text-xs text-accent font-mono">🔥 {profile.streak}</span>
                    )}
                  </div>
                  {/* Rank + XP bar */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] font-semibold shrink-0" style={{ color: rankInfo.color }}>
                      {rankInfo.label}
                    </span>
                    <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${progress.percent}%`, backgroundColor: rankInfo.color }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {progress.current}/{progress.required}
                    </span>
                  </div>
                  {/* Follower counts */}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      <span className="text-foreground font-semibold">{followersCount}</span> followers
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      <span className="text-foreground font-semibold">{profile.following_count}</span> following
                    </span>
                  </div>
                </div>

                {/* Follow button — hidden for own profile */}
                {!profile.is_self && (
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-all duration-[80ms]",
                      isFollowing
                        ? "bg-surface border-border text-muted-foreground hover:border-danger/50 hover:text-danger"
                        : "bg-accent text-accent-foreground border-accent"
                    )}
                    style={{ borderRadius: "var(--radius-badge)" }}
                  >
                    {isFollowing
                      ? <><UserCheck className="w-3 h-3" /> Following</>
                      : <><UserPlus  className="w-3 h-3" /> Follow</>
                    }
                  </button>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Win Rate",    value: `${profile.win_rate}%` },
                  { label: "Total Bets",  value: String(profile.total_bets) },
                  { label: "Best Streak", value: String(profile.best_streak) },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1 px-3 py-2.5 bg-surface border border-border"
                    style={{ borderRadius: "var(--radius-card)" }}
                  >
                    <span className="font-mono text-base font-bold text-foreground tabular-nums">{value}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center leading-tight">{label}</span>
                  </div>
                ))}
              </div>

              {/* Persona */}
              <div
                className="flex items-center gap-3 px-3 py-3 bg-surface border border-border"
                style={{ borderRadius: "var(--radius-card)" }}
              >
                <span className="text-2xl shrink-0">{profile.persona.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground">{profile.persona.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{profile.persona.description}</p>
                </div>
                <Zap className="w-3.5 h-3.5 text-accent ml-auto shrink-0" />
              </div>

              {/* Achievements */}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                  Achievements
                </p>
                <AchievementsGrid earned={profile.achievements} />
              </div>

              {/* Recent bets */}
              {profile.recent_bets.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-2">
                    Recent Calls
                  </p>
                  <div
                    className="flex flex-col divide-y divide-border border border-border overflow-hidden"
                    style={{ borderRadius: "var(--radius-card)" }}
                  >
                    {profile.recent_bets.map((bet, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-surface">
                        <p className="text-xs text-foreground truncate flex-1 mr-3 leading-snug">{bet.market_title}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-1.5 py-0.5",
                              bet.side === 'yes' ? "text-success bg-success/10" : "text-danger bg-danger/10"
                            )}
                            style={{ borderRadius: "var(--radius-badge)" }}
                          >
                            {bet.side.toUpperCase()}
                          </span>
                          {bet.won !== null && (
                            <span className={cn("text-[10px] font-bold font-mono", bet.won ? "text-success" : "text-danger")}>
                              {bet.won ? "W" : "L"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
