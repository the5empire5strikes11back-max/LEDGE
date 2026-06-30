import type { Metadata } from "next"
import Link from "next/link"
import { TrendingUp, TrendingDown, Flame, Zap, Shield, Trophy, ChevronRight, BarChart2, Users, Target, Check, ChevronDown, Quote } from "lucide-react"
import { PredictionQuiz } from "@/components/landing/prediction-quiz"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ledge-phi.vercel.app'

export const metadata: Metadata = {
  title: 'Ledge — Prove You Were Right',
  description: 'Stop arguing on social media with no record to back it up. Ledge is the free prediction market for sports, politics, and culture. 1,000 credits on signup. No real money, ever.',
  alternates: {
    canonical: `${BASE_URL}/landing`,
  },
  openGraph: {
    title: "Ledge — You're Always Right. Now You Have Proof.",
    description: 'Free prediction market for sports, politics & culture. Track your accuracy, build your streak, beat your friends. 1,000 credits free — no real money, ever.',
    url: `${BASE_URL}/landing`,
    siteName: 'Ledge',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Ledge — You're Always Right. Now You Have Proof.",
    description: 'Free prediction market for sports, politics & culture. Track your accuracy, build your streak, beat your friends.',
  },
  keywords: ['prediction market', 'sports betting game', 'free prediction app', 'social prediction market', 'predict sports', 'predict politics', 'fantasy predictions', 'ledge app'],
}

// ── Mock market card ─────────────────────────────────────────────────────────

function MockMarketCard({ title, yes, no, category, hot }: {
  title: string; yes: number; no: number; category: string; hot?: boolean
}) {
  return (
    <div className="bg-surface-2 border border-white/10 card-lift p-4 flex flex-col gap-3 shrink-0 w-[260px]" style={{ borderRadius: "12px" }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#8585A0] uppercase tracking-wider font-medium">{category}</span>
        {hot && (
          <span className="flex items-center gap-1 text-[9px] font-bold text-foreground uppercase tracking-wider">
            <Flame className="w-2.5 h-2.5" />Hot
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-[#EBEBEB] leading-snug">{title}</p>
      <div className="h-1.5 bg-[#202028] overflow-hidden rounded-full">
        <div className="h-full bg-white rounded-full" style={{ width: `${yes}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between px-3 py-2 bg-[#1A2E22] border border-[#22C55E]/20 rounded-lg">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-[#22C55E]" />
            <span className="text-[11px] font-bold text-[#22C55E] uppercase">Yes</span>
          </div>
          <span className="font-mono text-sm font-black text-[#22C55E]">{yes}%</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 bg-[#2E1A1A] border border-[#EF4444]/20 rounded-lg">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-[#EF4444]" />
            <span className="text-[11px] font-bold text-[#EF4444] uppercase">No</span>
          </div>
          <span className="font-mono text-sm font-black text-[#EF4444]">{no}%</span>
        </div>
      </div>
    </div>
  )
}

// ── FAQ item ─────────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-[#1C1C24] last:border-0">
      <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none text-sm font-semibold text-[#EBEBEB] hover:text-foreground transition-colors">
        {q}
        <ChevronDown className="w-4 h-4 shrink-0 text-[#8585A0] group-open:rotate-180 transition-transform" />
      </summary>
      <p className="pb-4 text-sm text-[#8585A0] leading-relaxed">{a}</p>
    </details>
  )
}

// ── Data ─────────────────────────────────────────────────────────────────────

const MARKETS = [
  { title: "Will the Fed cut rates before September?", yes: 62, no: 38, category: "Politics", hot: true },
  { title: "Will Doja Cat drop a new album this year?", yes: 41, no: 59, category: "Culture" },
  { title: "Will the Lakers make the playoffs?", yes: 78, no: 22, category: "Sports", hot: true },
  { title: "Will GPT-5 launch before Q3?", yes: 55, no: 45, category: "Culture" },
  { title: "Will inflation hit 3% by year end?", yes: 33, no: 67, category: "Politics" },
  { title: "Will Kendrick drop another album in 2025?", yes: 47, no: 53, category: "Culture", hot: true },
]


const FEATURES = [
  { icon: Target, title: "Predict anything", body: "Sports, politics, culture, crypto — if it can be called, it's on Ledge." },
  { icon: Zap, title: "Free credits, no risk", body: "500 CR every day just for showing up. No deposits, no losses that hurt." },
  { icon: Flame, title: "Build your streak", body: "Bet daily to grow your streak. Shields protect you when life gets in the way." },
  { icon: Users, title: "Circle markets", body: "Private groups where you and your friends bet against each other on anything." },
  { icon: Trophy, title: "Six ranks to climb", body: "Rookie → Forecaster → Analyst → Oracle → Market Maker. Accuracy is everything." },
  { icon: BarChart2, title: "Track your edge", body: "Win rate, XP, streak, payout history — know exactly how sharp you actually are." },
]

const STEPS = [
  { n: "01", title: "Claim your credits", body: "Sign up free and receive 1,000 CR instantly. No card, no catch." },
  { n: "02", title: "Find your market", body: "Browse live predictions across sports, politics, and culture. Tap YES or NO." },
  { n: "03", title: "Collect your payout", body: "Get it right and your credits multiply. Wrong? Learn the odds and go again." },
]

const FAQS = [
  { q: "Is this actually free? What's the catch?", a: "Completely free, no catch. Ledge uses virtual credits — there's no real money, no deposits, no withdrawals. You get 1,000 CR to start and 500 CR every day you log in." },
  { q: "Do I need to be a sports fan?", a: "Not at all. Ledge has markets across politics, pop culture, crypto, and entertainment. If you have an opinion on it, there's probably a market for it." },
  { q: "Can I ever lose real money?", a: "Never. Ledge is a virtual prediction game. The only thing at stake is your credits and your pride." },
  { q: "How do I earn more credits?", a: "Win bets to multiply your credits. Log in daily to get your 500 CR drop. Build a streak for bonus multipliers. Climb ranks to unlock bigger daily rewards." },
  { q: "What happens if my daily streak breaks?", a: "Streak shields protect you. Earn shields through gameplay and use them to keep your streak alive when you miss a day." },
  { q: "Can I bet against my friends?", a: "Yes — Circle markets let you create a private group, set the question, and bet against each other. Your circle, your rules." },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EBEBEB]">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1C1C24] bg-[#0A0A0B]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="Ledge" className="w-7 h-7" style={{ borderRadius: "8px" }} />
            <span className="font-bold text-base tracking-tight">Ledge</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-[#8585A0] hover:text-[#EBEBEB] transition-colors font-medium hidden sm:block">
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm font-semibold px-4 py-2 bg-white text-[#0A0A0B] hover:bg-white/90 transition-colors"
              style={{ borderRadius: "8px" }}
            >
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-16 px-5 text-center max-w-2xl mx-auto">

        {/* Editorial overline — replaces noisy pill badge */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="h-px w-10 bg-white/20" />
          <span className="text-[10px] text-foreground/50 uppercase tracking-[0.22em] font-medium">Prediction Market</span>
          <div className="h-px w-10 bg-white/20" />
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.1] mb-5">
          You&apos;re always right.<br />
          <span className="text-foreground">Now you have proof.</span>
        </h1>

        {/* Sub-headline */}
        <p className="text-[#8585A0] text-lg leading-relaxed mb-10 max-w-md mx-auto">
          Stop arguing on social media with no record to back it up. Bet on sports, politics, and culture — track your accuracy, build your streak, and beat your friends. Free forever.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
          <Link
            href="/auth/signup"
            className="flex items-center gap-2 px-7 py-3.5 bg-white text-[#0A0A0B] font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-all active:scale-95 w-full sm:w-auto justify-center"
            style={{ borderRadius: "10px" }}
          >
            Claim your free credits
            <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href="/auth/login"
            className="text-sm text-[#8585A0] hover:text-[#EBEBEB] transition-colors font-medium"
          >
            Already have an account →
          </Link>
        </div>

        {/* Unified trust line — social proof + FUD reducers in one clean row */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {["#E74C3C","#3498DB","#2ECC71","#F39C12"].map((c) => (
                <div key={c} className="w-5 h-5 rounded-full border border-[#1A1A22]" style={{ background: c }} />
              ))}
            </div>
            <span className="text-xs text-[#8585A0]">
              <span className="text-[#EBEBEB] font-semibold">2,400+</span> predictors
            </span>
          </div>
          <span className="text-[#2A2A36] text-xs select-none">·</span>
          <span className="text-xs text-[#8585A0]">
            <span className="font-mono font-bold text-foreground">1,000 CR</span> free on signup
          </span>
          <span className="text-[#2A2A36] text-xs select-none">·</span>
          <span className="text-xs text-[#8585A0]">
            <span className="font-mono font-bold text-foreground">500 CR</span> every day
          </span>
          <span className="text-[#2A2A36] text-xs select-none">·</span>
          <span className="text-xs text-[#8585A0]">
            <span className="font-semibold text-[#EBEBEB]">$0</span> real money, ever
          </span>
        </div>
      </section>

      {/* ── Market card marquee ─────────────────────────────────────────────── */}
      <section className="pb-20 overflow-hidden">
        <div
          className="flex gap-3 px-5"
          style={{ animation: "marquee 32s linear infinite", width: "max-content" }}
        >
          {[...MARKETS, ...MARKETS].map((m, i) => (
            <MockMarketCard key={i} {...m} />
          ))}
        </div>
        <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </section>

      {/* ── Prediction Quiz / Lead Assessment ──────────────────────────────── */}
      <section className="py-20 px-5 max-w-3xl mx-auto border-b border-[#1C1C24]">
        <PredictionQuiz />
      </section>

      {/* ── Pain point section ──────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[10px] text-foreground uppercase tracking-widest font-bold mb-3">Sound familiar?</p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-4">
            You called it. No one kept score.
          </h2>
          <p className="text-[#8585A0] text-base leading-relaxed max-w-lg mx-auto">
            You said the trade would fail. You knew who&apos;d win. You saw the comeback before anyone else.
            But without a record, it&apos;s just noise. Ledge turns every take into a trackable prediction — so your accuracy finally means something.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: BarChart2, stat: "Win rate tracked", body: "Every prediction logged. See exactly how sharp you are across sports, politics, and culture." },
            { icon: Trophy, stat: "Ranks that reflect skill", body: "Six tiers from Rookie to Market Maker. Your rank is earned, not bought." },
            { icon: Users, stat: "Compete with friends", body: "Circle markets let your group settle every debate with something on the line." },
          ].map((item) => (
            <div key={item.stat} className="bg-[#111116] border border-[#2A2A36] p-5 rounded-xl">
              <item.icon className="w-5 h-5 text-foreground mb-3" />
              <p className="text-sm font-bold text-[#EBEBEB] mb-1.5">{item.stat}</p>
              <p className="text-xs text-[#8585A0] leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-[#111116] border-y border-[#1C1C24]">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] text-foreground uppercase tracking-widest font-bold text-center mb-3">What players are saying</p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-center mb-12">
            Real takes. Real receipts.
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                handle: "@SharpTake23",
                tag: "Sports",
                quote: "Been saying LeBron was washed for 2 years. Now I have the streak to prove I called it.",
              },
              {
                handle: "@PoliticsNerd",
                tag: "Politics",
                quote: "Called the rate cut in April and the Fed pause in June. My group thinks I work at a hedge fund.",
              },
              {
                handle: "@SportsProphet",
                tag: "Multi-category",
                quote: "Lost my first 5 bets. Checked my stats, found the pattern, fixed it. Now 67% on the season.",
              },
            ].map((t) => (
              <div
                key={t.handle}
                className="bg-[#0A0A0B] border border-[#2A2A36] p-5 flex flex-col gap-4"
                style={{ borderRadius: "12px" }}
              >
                <Quote className="w-4 h-4 text-foreground/30 shrink-0" />
                <p className="text-sm text-[#EBEBEB] leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center justify-between gap-2 mt-auto">
                  <span className="text-xs font-bold text-[#8585A0]">{t.handle}</span>
                  <span className="text-[10px] font-bold text-foreground/60 uppercase tracking-wider bg-white/8 px-2 py-0.5" style={{ borderRadius: "4px" }}>{t.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 bg-[#0A0A0B] border-b border-[#1C1C24]">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] text-foreground uppercase tracking-widest font-bold text-center mb-3">How it works</p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-center mb-2">
            Three steps to your first win
          </h2>
          <p className="text-[#8585A0] text-sm text-center mb-12">Takes about 60 seconds to get started.</p>
          <div className="grid sm:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3">
                <span className="font-mono text-3xl font-black text-foreground/20">{s.n}</span>
                <h3 className="text-base font-bold text-[#EBEBEB]">{s.title}</h3>
                <p className="text-sm text-[#8585A0] leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────────────── */}
      <section className="py-12 border-b border-[#1C1C24]">
        <div className="max-w-3xl mx-auto px-5 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value: "500 CR", label: "Free every day" },
            { value: "6", label: "Ranks to climb" },
            { value: "3+", label: "Categories" },
            { value: "$0", label: "To get started" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-2xl font-black text-foreground font-mono">{s.value}</p>
              <p className="text-xs text-[#8585A0] mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-3xl mx-auto">
        <p className="text-[10px] text-foreground uppercase tracking-widest font-bold text-center mb-3">What you get</p>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-center mb-2">
          Every tool to prove you were right
        </h2>
        <p className="text-[#8585A0] text-sm text-center mb-12 max-w-sm mx-auto">
          Built for people who have opinions and want the record to show it.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-[#111116] border border-[#2A2A36] p-5 flex flex-col gap-3 hover:border-white/20 transition-colors"
              style={{ borderRadius: "12px" }}
            >
              <div className="w-8 h-8 bg-white/8 flex items-center justify-center" style={{ borderRadius: "8px" }}>
                <f.icon className="w-4 h-4 text-foreground" />
              </div>
              <h3 className="text-sm font-bold text-[#EBEBEB]">{f.title}</h3>
              <p className="text-xs text-[#8585A0] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Mid-page CTA ────────────────────────────────────────────────────── */}
      <section className="py-12 px-5 bg-[#111116] border-y border-[#2A2A36]">
        <div className="max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <p className="font-bold text-base text-[#EBEBEB]">Ready to start predicting?</p>
            <p className="text-sm text-[#8585A0] mt-1">Your first 1,000 credits are waiting.</p>
          </div>
          <Link
            href="/auth/signup"
            className="flex items-center gap-2 px-6 py-3 bg-white text-[#0A0A0B] font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-all shrink-0"
            style={{ borderRadius: "10px" }}
          >
            Get started free
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-2xl mx-auto">
        <p className="text-[10px] text-foreground uppercase tracking-widest font-bold text-center mb-3">FAQ</p>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-center mb-12">
          No catch. Here&apos;s the proof.
        </h2>
        <div className="bg-[#111116] border border-[#2A2A36] px-6 py-2" style={{ borderRadius: "12px" }}>
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} {...faq} />
          ))}
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────────── */}
      <section className="py-20 px-5 max-w-xl mx-auto text-center">
        <div className="bg-[#111116] border border-[#2A2A36] p-8 sm:p-12" style={{ borderRadius: "16px" }}>
          <Shield className="w-8 h-8 text-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-black tracking-tight mb-3">
            Your first 1,000 credits are waiting.
          </h2>
          <p className="text-sm text-[#8585A0] mb-6 leading-relaxed">
            No credit card. No real money. Just sign up and start calling it.
          </p>

          {/* Value props */}
          <ul className="flex flex-col gap-2 mb-8 text-left max-w-xs mx-auto">
            {["Takes 60 seconds to sign up", "500 free credits every single day", "No money, no risk, ever"].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-[#B0B0C8]">
                <Check className="w-3.5 h-3.5 text-foreground shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-[#0A0A0B] font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-all active:scale-95"
            style={{ borderRadius: "10px" }}
          >
            Claim free credits
            <ChevronRight className="w-4 h-4" />
          </Link>
          <p className="text-[10px] text-[#8585A0]/60 mt-4 uppercase tracking-wider">Free forever · No credit card</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#1C1C24] py-8 px-5">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="Ledge" className="w-5 h-5" style={{ borderRadius: "5px" }} />
            <span className="text-sm font-semibold text-[#8585A0]">Ledge</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#8585A0]">
            <Link href="/privacy" className="hover:text-[#EBEBEB] transition-colors">Privacy Policy</Link>
            <span className="text-[#2A2A36]">·</span>
            <Link href="/terms" className="hover:text-[#EBEBEB] transition-colors">Terms of Service</Link>
            <span className="text-[#2A2A36]">·</span>
            <span>© 2025 Ledge</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
