"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    if (username.length < 3) {
      setError("Username must be at least 3 characters")
      setLoading(false)
      return
    }

    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.")
      setLoading(false)
      return
    }

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(
        data.error ??
          (res.status === 429
            ? "Too many attempts. Please wait a few minutes and try again."
            : "Sign up failed. Please try again.")
      )
      setLoading(false)
      return
    }

    router.push("/onboarding")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <img src="/icon.svg" alt="Ledge" className="w-16 h-16" style={{ borderRadius: "18px" }} />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Join Ledge</h1>
            <p className="text-sm text-muted-foreground mt-1">Start with 5,000 free credits</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="your_handle"
              required
              maxLength={20}
              className={cn(
                "w-full bg-card border border-border px-4 py-3 text-sm font-mono",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={cn(
                "w-full bg-card border border-border px-4 py-3 text-sm",
                "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              )}
              style={{ borderRadius: "var(--radius-button)" }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 8 characters"
                required
                minLength={8}
                className={cn(
                  "w-full bg-card border border-border px-4 py-3 pr-11 text-sm",
                  "placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
                )}
                style={{ borderRadius: "var(--radius-button)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Terms & privacy consent */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="sr-only"
              />
              <div
                className={cn(
                  "w-4 h-4 border flex items-center justify-center transition-colors",
                  agreedToTerms
                    ? "bg-accent border-accent"
                    : "bg-card border-border group-hover:border-accent/50"
                )}
                style={{ borderRadius: "4px" }}
              >
                {agreedToTerms && (
                  <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2.5">
                    <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-foreground" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground leading-relaxed">
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="text-accent hover:underline font-medium">
                Terms of Service
              </Link>
              {" "}and{" "}
              <Link href="/privacy" target="_blank" className="text-accent hover:underline font-medium">
                Privacy Policy
              </Link>
              . Ledge uses virtual credits only — no real money.
            </span>
          </label>

          {error && <p className="text-sm text-danger font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading || !agreedToTerms}
            className="w-full bg-accent text-accent-foreground font-semibold py-3 text-sm uppercase tracking-wider hover:bg-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderRadius: "var(--radius-button)" }}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-accent font-medium hover:text-accent/80 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
