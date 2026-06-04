import Link from "next/link"

// ── Shared layout for legal/policy pages ─────────────────────────────────────

interface Section {
  heading: string
  body: React.ReactNode
}

interface LegalPageProps {
  title: string
  subtitle: string
  lastUpdated: string
  sections: Section[]
}

export function LegalPage({ title, subtitle, lastUpdated, sections }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-sm font-semibold hover:text-accent transition-colors"
          >
            <div
              className="w-7 h-7 bg-accent flex items-center justify-center flex-shrink-0"
              style={{ borderRadius: "6px" }}
            >
              <span className="text-accent-foreground font-bold text-xs">L</span>
            </div>
            Ledge
          </Link>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-5 py-12">

        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">Legal</p>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{title}</h1>
          <p className="text-muted-foreground text-sm">{subtitle}</p>
          <p className="text-xs text-muted-foreground/60 mt-3 font-mono">Last updated: {lastUpdated}</p>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-semibold text-foreground mb-3 pb-2 border-b border-border/50">
                {s.heading}
              </h2>
              <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground/50">
            © {new Date().getFullYear()} Ledge · Free-to-play · No real money
          </p>
          <div className="flex justify-center gap-4 mt-3 text-xs">
            <Link href="/privacy" className="text-muted-foreground hover:text-accent transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-muted-foreground hover:text-accent transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
