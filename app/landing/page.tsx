import Link from "next/link"
import { TrendingUp, TrendingDown, Flame, Zap, Shield, Trophy, ChevronRight, BarChart2, Users, Target } from "lucide-react"

function MockMarketCard({ title, yes, no, category, hot }: { title: string; yes: number; no: number; category: string; hot?: boolean }) {
  return (
    <div
      className="bg-[#111116] border border-[#2A2A36] p-4 flex flex-col gap-3 shrink-0 w-[280px]"
      style={{ borderRadius: "12px" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#8585A0] uppercase tracking-wider font-medium">{category}</span>
        {hot && (
          <span className="flex items-center gap-1 text-[9px] font-bold text-[#F5A623] uppercase tracking-wider">
            <Flame className="w-2.5 h-2.5" />Hot
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-[#EBEBEB] leading-snug">{title}</p>
      <div className="h-1.5 bg-[#202028] overflow-hidden rounded-full">
        <div className="h-full bg-[#F5A623] rounded-full" style={{ width: `${yes}%` }} />
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

const MARKETS = [
  { title: "Will the Fed cut rates before September?", yes: 62, no: 38, category: "Politics", hot: true },
  { title: "Will Doja Cat drop a new album this year?", yes: 41, no: 59, category: "Culture" },
  { title: "Will the Lakers make the playoffs?", yes: 78, no: 22, category: "Sports", hot: true },
  { title: "Will GPT-5 launch before Q3?", yes: 55, no: 45, category: "Culture" },
  { title: "Will inflation hit 3% by year end?", yes: 33, no: 67, category: "Politics" },
]

const FEATURES = [
  {
    icon: Target,
    title: "Predict anything",
    body: "Sports, politics, culture, crypto — if it can be called, it can be bet on.",
  },
  {
    icon: Zap,
    title: "Free credits, no real money",
    body: "500 CR every day just for showing up. No deposits, no risk, all the thrill.",
  },
  {
    icon: Flame,
    title: "Build your streak",
    body: "Bet daily to grow your streak. Miss a day and it resets — shields protect you.",
  },
  {
    icon: Users,
    title: "Circle markets",
    body: "Create private groups and bet against your friends on anything you want.",
  },
  {
    icon: Trophy,
    title: "Climb the ranks",
    body: "Rookie → Forecaster → Analyst → Oracle → Market Maker. Your accuracy matters.",
  },
  {
    icon: BarChart2,
    title: "Track your edge",
    body: "Win rate, XP, streak, payout history — know exactly where you stand.",
  },
]

const STEPS = [
  { n: "01", title: "Get your credits", body: "Sign up and receive 1,000 free CR. More every day you return." },
  { n: "02", title: "Pick your markets", body: "Browse live predictions across sports, politics, and culture. Tap YES or NO." },
  { n: "03", title: "Collect your payout", body: "Call it right and your credits multiply. Wrong? Learn and go again." },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EBEBEB]">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1C1C24] bg-[#0A0A0B]/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="Ledge" className="w-7 h-7" style={{ borderRadius: "8px" }} />
            <span className="font-bold text-base tracking-tight">Ledge</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-sm text-[#8585A0] hover:text-[#EBEBEB] transition-colors font-medium"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm font-semibold px-4 py-2 bg-[#F5A623] text-[#0A0A0B] hover:bg-[#F5A623]/90 transition-colors"
              style={{ borderRadius: "8px" }}
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-5 text-center max-w-2xl mx-auto">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#F5A623]/10 border border-[#F5A623]/25 text-[#F5A623] text-[11px] font-bold uppercase tracking-widest mb-6"
          style={{ borderRadius: "999px" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#F5A623] animate-pulse" />
          Free to play · No real money
        </div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.1] mb-5">
          Predict the future.<br />
          <span className="text-[#F5A623]">Win big.</span>
        </h1>
        <p className="text-[#8585A0] text-lg leading-relaxed mb-8 max-w-md mx-auto">
          Bet on sports, politics, and culture with free virtual credits.
          Compete with friends, build your streak, and prove you called it.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/auth/signup"
            className="flex items-center gap-2 px-6 py-3 bg-[#F5A623] text-[#0A0A0B] font-bold text-sm uppercase tracking-wider hover:bg-[#F5A623]/90 transition-all active:scale-95"
            style={{ borderRadius: "10px" }}
          >
            Start for free
            <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href="/auth/login"
            className="flex items-center gap-2 px-6 py-3 bg-[#111116] border border-[#2A2A36] text-[#EBEBEB] font-semibold text-sm hover:border-[#F5A623]/40 transition-all"
            style={{ borderRadius: "10px" }}
          >
            Sign in
          </Link>
        </div>
        <p className="text-[#8585A0] text-xs mt-4">1,000 free credits on signup · No credit card required</p>
      </section>

      {/* Market cards scroll */}
      <section className="pb-20 overflow-hidden">
        <div
          className="flex gap-3 px-5"
          style={{
            animation: "marquee 30s linear infinite",
            width: "max-content",
          }}
        >
          {[...MARKETS, ...MARKETS].map((m, i) => (
            <MockMarketCard key={i} {...m} />
          ))}
        </div>
        <style>{`
          @keyframes marquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}</style>
      </section>

      {/* How it works */}
      <section className="py-20 px-5 max-w-3xl mx-auto">
        <p className="text-[10px] text-[#F5A623] uppercase tracking-widest font-bold text-center mb-3">How it works</p>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-center mb-12">
          Three steps to your first win
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="flex flex-col gap-3">
              <span className="font-mono text-3xl font-black text-[#F5A623]/20">{s.n}</span>
              <h3 className="text-base font-bold text-[#EBEBEB]">{s.title}</h3>
              <p className="text-sm text-[#8585A0] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats strip */}
      <section className="py-10 border-y border-[#1C1C24] bg-[#111116]">
        <div className="max-w-3xl mx-auto px-5 grid grid-cols-3 gap-4 text-center">
          {[
            { value: "500 CR", label: "Free daily credits" },
            { value: "∞", label: "Markets to predict" },
            { value: "6 ranks", label: "From Rookie to Market Maker" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-2xl font-black text-[#F5A623] font-mono">{s.value}</p>
              <p className="text-xs text-[#8585A0] mt-1 leading-snug">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-5 max-w-3xl mx-auto">
        <p className="text-[10px] text-[#F5A623] uppercase tracking-widest font-bold text-center mb-3">Features</p>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-center mb-12">
          Everything you need to dominate
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-[#111116] border border-[#2A2A36] p-5 flex flex-col gap-3 hover:border-[#F5A623]/30 transition-colors"
              style={{ borderRadius: "12px" }}
            >
              <div
                className="w-8 h-8 bg-[#F5A623]/10 flex items-center justify-center"
                style={{ borderRadius: "8px" }}
              >
                <f.icon className="w-4 h-4 text-[#F5A623]" />
              </div>
              <h3 className="text-sm font-bold text-[#EBEBEB]">{f.title}</h3>
              <p className="text-xs text-[#8585A0] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-5 text-center max-w-xl mx-auto">
        <div
          className="bg-[#111116] border border-[#2A2A36] p-8 sm:p-12"
          style={{ borderRadius: "16px" }}
        >
          <Shield className="w-8 h-8 text-[#F5A623] mx-auto mb-4" />
          <h2 className="text-2xl font-black tracking-tight mb-3">No money. No risk. Just calls.</h2>
          <p className="text-sm text-[#8585A0] mb-8 leading-relaxed">
            Ledge uses virtual credits only. There's no real money involved, ever.
            Just the satisfaction of being right.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#F5A623] text-[#0A0A0B] font-bold text-sm uppercase tracking-wider hover:bg-[#F5A623]/90 transition-all active:scale-95"
            style={{ borderRadius: "10px" }}
          >
            Create free account
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
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
