"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, LogIn, TrendingUp, TrendingDown, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { CircleDetail } from "@/components/circle-detail"
import type { RankKey } from "@/components/user-profile-card"
import { UserAvatar, CircleAvatar } from "@/components/ui/user-avatar"

interface CircleMember {
  id: string
  username: string
  avatarUrl?: string | null
  rank: RankKey
  credits: number
  weeklyChange: number
  isCurrentUser?: boolean
}

interface CircleMarket {
  id: string
  title: string
  category: "Sports" | "Politics" | "Culture" | "Circle"
  endTime: string
  yesPercent: number
  yesPool: number
  noPool: number
  totalCredits: number
  hotScore?: number
  momentumShift?: number
  isFeatured?: boolean
  isNearMiss?: boolean
  userBet?: { side: "yes" | "no"; amount: number }
  resolved?: { winner: "yes" | "no" }
}

interface Circle {
  id: string
  name: string
  inviteCode: string
  circleAvatarUrl?: string | null
  createdBy: string
  members: CircleMember[]
  markets: CircleMarket[]
  recentBets24h: number
}

interface CirclesScreenProps {
  availableCredits: number
  onBet: (
    marketTitle: string,
    marketCategory: string,
    side: "yes" | "no",
    amount: number,
    yesPercent: number,
    majorityWas: "yes" | "no",
    serverCredits?: number,
    serverXp?: number,
    marketEndTime?: string,
  ) => void
}

function formatCredits(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

function MemberAvatarStack({ members }: { members: CircleMember[] }) {
  const top3 = members.slice(0, 3)
  return (
    <div className="flex -space-x-2">
      {top3.map((m) => (
        <div key={m.id} className="ring-2 ring-background rounded-full">
          <UserAvatar username={m.username} avatarUrl={m.avatarUrl} size={24} />
        </div>
      ))}
      {members.length > 3 && (
        <div className="w-6 h-6 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[9px] font-mono font-bold text-muted-foreground">
          +{members.length - 3}
        </div>
      )}
    </div>
  )
}

function CircleCard({ circle, onClick }: { circle: Circle; onClick: () => void }) {
  const sorted = [...circle.members].sort((a, b) => b.credits - a.credits)
  const leader = sorted[0]
  const me = sorted.find((m) => m.isCurrentUser)
  const myRank = me ? sorted.indexOf(me) + 1 : null

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border hover:border-accent/40 transition-all duration-200 overflow-hidden group card-lift"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <CircleAvatar name={circle.name} avatarUrl={circle.circleAvatarUrl} size={36} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-accent transition-colors">
                {circle.name}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {circle.members.length} member{circle.members.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <MemberAvatarStack members={sorted} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {/* Leader */}
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Leader</span>
            <span className="text-xs font-mono font-semibold text-foreground truncate">
              {leader ? `@${leader.username}` : "—"}
            </span>
          </div>

          {/* Your rank */}
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Your rank</span>
            <span className="text-xs font-mono font-bold text-accent">
              {myRank ? `#${myRank}` : "—"}
            </span>
          </div>

          {/* Your 7d change */}
          <div className="flex flex-col">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">7d change</span>
            {me ? (
              <span className={cn(
                "text-xs font-mono font-semibold flex items-center gap-0.5",
                me.weeklyChange >= 0 ? "text-success" : "text-danger"
              )}>
                {me.weeklyChange >= 0
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />
                }
                {formatCredits(Math.abs(me.weeklyChange))}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>
        </div>

        {/* Invite code row + activity pulse */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-[10px] text-muted-foreground">
            Code: <span className="font-mono font-bold text-accent tracking-wider">{circle.inviteCode}</span>
          </span>
          <div className="flex items-center gap-2">
            {circle.recentBets24h > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-success font-medium">
                <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                {circle.recentBets24h} bet{circle.recentBets24h !== 1 ? "s" : ""} today
              </span>
            )}
            <span className="text-[10px] text-muted-foreground/50 group-hover:text-accent transition-colors">
              View →
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

export function CirclesScreen({ availableCredits, onBet }: CirclesScreenProps) {
  const [circles, setCircles] = useState<Circle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCircle, setSelectedCircle] = useState<Circle | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Create modal state
  const [creating, setCreating] = useState(false)
  const [newCircleName, setNewCircleName] = useState("")
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState("")

  // Join modal state
  const [joining, setJoining] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joinError, setJoinError] = useState("")
  const [joinLoading, setJoinLoading] = useState(false)

  const loadCircles = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/circles')
    if (res.ok) {
      const data = await res.json()
      const mapped: Circle[] = data.map((c: {
        id: string
        name: string
        invite_code: string
        created_by: string
        circle_avatar_url?: string | null
        recent_bets_24h?: number
        circle_members: Array<{
          user_id: string
          weeklyChange: number
          profiles: { id: string; username: string; rank: string; credits: number; avatar_url?: string | null; is_current_user?: boolean } | null
        }>
      }) => ({
        id: c.id,
        name: c.name,
        inviteCode: c.invite_code,
        createdBy: c.created_by,
        circleAvatarUrl: c.circle_avatar_url ?? null,
        recentBets24h: c.recent_bets_24h ?? 0,
        markets: [],
        members: (c.circle_members ?? [])
          .filter((m) => m.profiles != null)
          .map((m) => ({
            id: m.profiles!.id,
            username: m.profiles!.username,
            avatarUrl: m.profiles!.avatar_url ?? null,
            rank: (m.profiles!.rank ?? 'rookie') as RankKey,
            credits: m.profiles!.credits,
            weeklyChange: m.weeklyChange ?? 0,
            isCurrentUser: m.profiles!.is_current_user ?? false,
          })),
      }))
      setCircles(mapped)
      // Let page.tsx know user has circles so it can show the nav badge
      if (mapped.length > 0) {
        localStorage.setItem('ledge_has_circles', 'true')
      }
    }
    setLoading(false)
  }, [])

  // Also mark current user in members — API doesn't flag this, so we do it
  // by fetching the current user's profile id
  useEffect(() => {
    loadCircles().then(async () => {
      // Tag current user in each circle's members list
      const profileRes = await fetch('/api/user')
      if (!profileRes.ok) return
      const profile = await profileRes.json()
      setCurrentUserId(profile.id)
      setCircles((prev) => prev.map((c) => ({
        ...c,
        members: c.members.map((m) => ({ ...m, isCurrentUser: m.id === profile.id })),
      })))
    })
  }, [loadCircles])

  const handleCreateCircle = async () => {
    if (!newCircleName.trim()) return
    setCreateLoading(true)
    setCreateError("")
    try {
      const res = await fetch('/api/circles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCircleName.trim() }),
      })
      if (res.ok) {
        setNewCircleName("")
        setCreating(false)
        loadCircles()
      } else {
        const data = await res.json().catch(() => ({}))
        setCreateError(data.error ?? 'Failed to create circle')
      }
    } catch {
      setCreateError('Failed to create circle. Check your connection and try again.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleJoinCircle = async () => {
    if (!joinCode.trim()) return
    setJoinLoading(true)
    setJoinError("")
    try {
      const res = await fetch('/api/circles/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: joinCode.trim() }),
      })
      if (res.ok) {
        setJoinCode("")
        setJoining(false)
        loadCircles()
      } else {
        const data = await res.json().catch(() => ({}))
        setJoinError(data.error ?? 'Something went wrong')
      }
    } catch {
      setJoinError('Failed to join circle. Check your connection and try again.')
    } finally {
      setJoinLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
            {loading ? "—" : `${circles.length} circle${circles.length !== 1 ? "s" : ""}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setJoining(true); setCreating(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <LogIn className="w-3 h-3" />
              Join
            </button>
            <button
              onClick={() => { setCreating(true); setJoining(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground text-xs font-semibold uppercase tracking-wider hover:bg-accent/90 transition-all active:scale-95"
              style={{ borderRadius: "var(--radius-button)" }}
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3 lg:max-w-2xl lg:mx-auto">

          {/* Create circle form */}
          {creating && (
            <div
              className="bg-card border border-accent/30 p-4 space-y-3 animate-in slide-in-from-top-2 fade-in duration-200"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">New Circle</p>
              <input
                autoFocus
                type="text"
                value={newCircleName}
                onChange={(e) => { setNewCircleName(e.target.value); setCreateError("") }}
                onKeyDown={(e) => e.key === "Enter" && handleCreateCircle()}
                placeholder="e.g. Degen Squad"
                className="w-full bg-background border border-border px-3 py-2 text-sm font-mono outline-none focus:border-accent transition-colors"
                style={{ borderRadius: "var(--radius-button)" }}
              />
              {createError && <p className="text-[11px] text-danger font-medium">{createError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleCreateCircle}
                  disabled={createLoading || !newCircleName.trim()}
                  className="flex-1 py-2 bg-accent text-accent-foreground text-xs font-bold uppercase tracking-wider hover:bg-accent/90 transition-all active:scale-95 disabled:opacity-50"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  {createLoading ? "Creating…" : "Create"}
                </button>
                <button
                  onClick={() => { setCreating(false); setNewCircleName(""); setCreateError("") }}
                  className="flex-1 py-2 bg-secondary text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Join circle form */}
          {joining && (
            <div
              className="bg-card border border-border p-4 space-y-3 animate-in slide-in-from-top-2 fade-in duration-200"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground">Join a Circle</p>
              <input
                autoFocus
                type="text"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError("") }}
                onKeyDown={(e) => e.key === "Enter" && handleJoinCircle()}
                placeholder="Enter invite code"
                className={cn(
                  "w-full bg-background border px-3 py-2 text-sm font-mono uppercase tracking-widest outline-none focus:border-accent transition-colors",
                  joinError ? "border-danger" : "border-border"
                )}
                style={{ borderRadius: "var(--radius-button)" }}
              />
              {joinError && <p className="text-[11px] text-danger font-medium">{joinError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleJoinCircle}
                  disabled={joinLoading || !joinCode.trim()}
                  className="flex-1 py-2 bg-foreground text-background text-xs font-bold uppercase tracking-wider hover:bg-foreground/90 transition-all active:scale-95 disabled:opacity-50"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  {joinLoading ? "Joining…" : "Join"}
                </button>
                <button
                  onClick={() => { setJoining(false); setJoinCode(""); setJoinError("") }}
                  className="flex-1 py-2 bg-secondary text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:text-foreground transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : circles.length === 0 && !creating && !joining ? (
            <div
              className="border-2 border-dashed border-border py-14 flex flex-col items-center gap-3 text-center"
              style={{ borderRadius: "var(--radius-card)" }}
            >
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">No circles yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Create one or join with an invite code</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setJoining(true)}
                  className="px-4 py-2 border border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  Join Circle
                </button>
                <button
                  onClick={() => setCreating(true)}
                  className="px-4 py-2 bg-accent text-accent-foreground text-xs font-semibold uppercase tracking-wider hover:bg-accent/90 transition-all"
                  style={{ borderRadius: "var(--radius-button)" }}
                >
                  Create Circle
                </button>
              </div>
            </div>
          ) : (
            <>
              {circles.map((circle) => (
                <CircleCard
                  key={circle.id}
                  circle={circle}
                  onClick={() => setSelectedCircle(circle)}
                />
              ))}

              {circles.length > 0 && !creating && !joining && (
                <div
                  className="border-2 border-dashed border-border py-8 flex flex-col items-center gap-2 text-center"
                  style={{ borderRadius: "var(--radius-card)" }}
                >
                  <p className="text-xs text-muted-foreground">Want to compete with more people?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setJoining(true)}
                      className="px-3 py-1.5 border border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all"
                      style={{ borderRadius: "var(--radius-button)" }}
                    >
                      Join Circle
                    </button>
                    <button
                      onClick={() => setCreating(true)}
                      className="px-3 py-1.5 bg-accent text-accent-foreground text-xs font-semibold uppercase tracking-wider hover:bg-accent/90 transition-all"
                      style={{ borderRadius: "var(--radius-button)" }}
                    >
                      New Circle
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Circle detail overlay */}
      {selectedCircle && (
        <CircleDetail
          circle={selectedCircle}
          availableCredits={availableCredits}
          isCreator={currentUserId !== null && selectedCircle.createdBy === currentUserId}
          onClose={() => setSelectedCircle(null)}
          onDelete={(circleId) => {
            setCircles((prev) => prev.filter((c) => c.id !== circleId))
            setSelectedCircle(null)
          }}
          onBet={onBet}
        />
      )}
    </div>
  )
}
