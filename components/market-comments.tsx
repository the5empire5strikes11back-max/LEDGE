"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { ThumbsUp, ThumbsDown, Flag, Trash2, ImagePlus, X, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/ui/user-avatar"

interface Comment {
  id: string
  user_id: string
  username: string
  avatar_url: string | null
  body: string
  image_url: string | null
  like_count: number
  dislike_count: number
  created_at: string
  user_reaction: 'like' | 'dislike' | null
  is_own: boolean
}

interface MarketCommentsProps {
  marketId: string
  currentUsername?: string | null
  currentAvatarUrl?: string | null
  onUsernameClick?: (username: string) => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function MarketComments({
  marketId,
  currentUsername,
  currentAvatarUrl,
  onUsernameClick,
}: MarketCommentsProps) {
  const [comments, setComments]         = useState<Comment[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(false)
  const [page, setPage]                 = useState(1)
  const [hasMore, setHasMore]           = useState(false)
  const [body, setBody]                 = useState("")
  const [imageFile, setImageFile]       = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting]     = useState(false)
  const [lightboxUrl, setLightboxUrl]   = useState<string | null>(null)
  const [menuOpen, setMenuOpen]         = useState<string | null>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  const fetchComments = useCallback(async (p: number, replace: boolean) => {
    if (replace) setLoading(true)
    try {
      const res = await fetch(`/api/comments?marketId=${marketId}&page=${p}`)
      if (!res.ok) { setError(true); return }
      const data = await res.json() as { comments: Comment[]; hasMore: boolean }
      setError(false)
      setComments((prev) => replace ? data.comments : [...prev, ...data.comments])
      setHasMore(data.hasMore)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [marketId])

  useEffect(() => { fetchComments(1, true) }, [fetchComments])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5 MB"); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const removeImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async () => {
    if (!body.trim() && !imageFile) return
    setSubmitting(true)

    try {
      let imageUrl: string | null = null

      if (imageFile) {
        const tempId = crypto.randomUUID()
        const fd = new FormData()
        fd.append("file", imageFile)
        const imgRes  = await fetch(`/api/comments/${tempId}/image`, { method: "POST", body: fd })
        const imgData = await imgRes.json() as { imageUrl?: string; error?: string }
        if (!imgRes.ok) { alert(imgData.error ?? "Image upload failed"); return }
        imageUrl = imgData.imageUrl ?? null
      }

      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, body: body.trim() || ".", imageUrl }),
      })
      const data = await res.json() as Comment & { error?: string }
      if (!res.ok) { alert(data.error ?? "Failed to post"); return }

      setComments((prev) => [data, ...prev])
      setBody("")
      removeImage()
    } catch {
      alert("Couldn't post your comment. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReact = async (commentId: string, type: 'like' | 'dislike') => {
    // Optimistic update
    setComments((prev) => prev.map((c) => {
      if (c.id !== commentId) return c
      const wasActive = c.user_reaction === type
      const wasOpposite = c.user_reaction !== null && c.user_reaction !== type
      return {
        ...c,
        like_count: type === 'like'
          ? (wasActive ? c.like_count - 1 : c.like_count + 1)
          : (wasOpposite ? c.like_count - 1 : c.like_count),
        dislike_count: type === 'dislike'
          ? (wasActive ? c.dislike_count - 1 : c.dislike_count + 1)
          : (wasOpposite ? c.dislike_count - 1 : c.dislike_count),
        user_reaction: wasActive ? null : type,
      }
    }))

    try {
      const res = await fetch(`/api/comments/${commentId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) fetchComments(1, true) // revert on error
    } catch {
      fetchComments(1, true) // revert on network failure
    }
  }

  const handleDelete = async (commentId: string) => {
    setMenuOpen(null)
    if (!confirm("Delete this comment?")) return
    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" })
      if (!res.ok) { alert("Couldn't delete comment. Please try again."); return }
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch {
      alert("Couldn't delete comment. Check your connection and try again.")
    }
  }

  const handleReport = async (commentId: string) => {
    setMenuOpen(null)
    try {
      const res = await fetch(`/api/comments/${commentId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "user_report" }),
      })
      if (res.status === 409) { alert("Already reported"); return }
      alert("Comment reported. Thanks.")
    } catch {
      alert("Couldn't report comment. Check your connection and try again.")
    }
  }

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    fetchComments(next, false)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 bg-accent rounded-full" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          Takes{comments.length > 0 ? ` (${comments.length}${hasMore ? "+" : ""})` : ""}
        </span>
      </div>

      {/* Comment input */}
      {currentUsername ? (
        <div className="border border-border bg-surface" style={{ borderRadius: "var(--radius-card)" }}>
          {imagePreview && (
            <div className="relative px-3 pt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="preview"
                className="w-full max-h-40 object-cover"
                style={{ borderRadius: "var(--radius-button)" }}
              />
              <button
                onClick={removeImage}
                className="absolute top-4 right-4 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3 text-foreground" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <UserAvatar username={currentUsername} avatarUrl={currentAvatarUrl} size={26} className="shrink-0" />
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
              placeholder="Add a take…"
              maxLength={500}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Attach image"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || (!body.trim() && !imageFile)}
              className="text-accent disabled:text-muted-foreground/30 transition-colors shrink-0 active:scale-90"
            >
              {submitting
                ? <span className="w-4 h-4 border border-accent border-t-transparent rounded-full animate-spin inline-block" />
                : <Send className="w-4 h-4" />
              }
            </button>
          </div>
        </div>
      ) : (
        <div
          className="px-4 py-3 text-center border border-border bg-surface text-xs text-muted-foreground"
          style={{ borderRadius: "var(--radius-card)" }}
        >
          Sign in to join the discussion.
        </div>
      )}

      {/* Comment list */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-surface border border-border animate-pulse" style={{ borderRadius: "var(--radius-card)" }} />
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-5 text-center bg-surface border border-border" style={{ borderRadius: "var(--radius-card)" }}>
          <p className="text-xs text-muted-foreground">Couldn&apos;t load comments.</p>
        </div>
      ) : comments.length === 0 ? (
        <div
          className="px-4 py-5 text-center bg-surface border border-border"
          style={{ borderRadius: "var(--radius-card)" }}
        >
          <p className="text-xs text-muted-foreground">No takes yet. Be first.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border border border-border overflow-hidden" style={{ borderRadius: "var(--radius-card)" }}>
          {comments.map((comment) => (
            <div key={comment.id} className="flex flex-col gap-2 px-3 py-3 bg-surface">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <UserAvatar username={comment.username} avatarUrl={comment.avatar_url} size={22} className="shrink-0" />
                  <button
                    onClick={() => onUsernameClick?.(comment.username)}
                    className="text-xs font-medium text-foreground hover:text-accent transition-colors truncate"
                  >
                    @{comment.username}
                  </button>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(comment.created_at)}</span>
                </div>

                {/* Context menu */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setMenuOpen(menuOpen === comment.id ? null : comment.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5"
                  >
                    <span className="text-xs leading-none">•••</span>
                  </button>
                  {menuOpen === comment.id && (
                    <div
                      className="absolute right-0 top-6 z-20 min-w-[110px] bg-surface-2 border border-border shadow-xl py-1"
                      style={{ borderRadius: "var(--radius-card)" }}
                    >
                      {comment.is_own ? (
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReport(comment.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                        >
                          <Flag className="w-3 h-3" /> Report
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Body */}
              {comment.body && comment.body !== "." && (
                <p className="text-sm text-foreground leading-relaxed break-words">{comment.body}</p>
              )}

              {/* Image */}
              {comment.image_url && (
                <button onClick={() => setLightboxUrl(comment.image_url)} className="text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={comment.image_url}
                    alt="comment attachment"
                    className="w-full max-h-48 object-cover"
                    style={{ borderRadius: "var(--radius-button)" }}
                  />
                </button>
              )}

              {/* Reactions */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleReact(comment.id, 'like')}
                  className={cn(
                    "flex items-center gap-1 text-[11px] transition-colors active:scale-90",
                    comment.user_reaction === 'like' ? "text-success" : "text-muted-foreground hover:text-success"
                  )}
                >
                  <ThumbsUp className="w-3 h-3" />
                  {comment.like_count > 0 && <span className="font-mono">{comment.like_count}</span>}
                </button>
                <button
                  onClick={() => handleReact(comment.id, 'dislike')}
                  className={cn(
                    "flex items-center gap-1 text-[11px] transition-colors active:scale-90",
                    comment.user_reaction === 'dislike' ? "text-danger" : "text-muted-foreground hover:text-danger"
                  )}
                >
                  <ThumbsDown className="w-3 h-3" />
                  {comment.dislike_count > 0 && <span className="font-mono">{comment.dislike_count}</span>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={loadMore}
          className="text-xs text-accent hover:text-accent/80 transition-colors py-1 text-center"
        >
          Load more takes
        </button>
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="full size"
            className="max-w-full max-h-full object-contain"
            style={{ borderRadius: "var(--radius-card)" }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>
      )}

      {/* Dismiss context menu on outside click */}
      {menuOpen && (
        <div className="fixed inset-0 z-[15]" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  )
}
