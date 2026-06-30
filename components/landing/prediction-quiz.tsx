"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronRight, Check, BarChart2, Map, Trophy } from "lucide-react"

// ── Questions ─────────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    text: "What do you predict most?",
    options: ["Sports", "Politics", "Pop culture / entertainment", "Crypto & markets", "Everything — I have opinions on all of it"],
  },
  {
    text: "How often do you make predictions?",
    options: ["Occasionally — when something big is happening", "A few times a week", "Every single day", "Constantly, without even thinking about it"],
  },
  {
    text: "When you're right, does anyone know?",
    options: ["Never — I have zero receipts", "Sometimes, if I yell loud enough", "My group chat sort of believes me", "I keep mental score myself"],
  },
  {
    text: "What's your biggest obstacle to being taken seriously?",
    options: ["No way to track and prove my picks", "Nobody believes me without a record", "My friends won't commit to a platform", "My takes are good but not consistent enough"],
  },
  {
    text: "What would prove you're the sharpest person in the room?",
    options: ["A verified win rate people can't dispute", "Outranking my friends on a leaderboard", "A streak record that shows daily consistency", "All three — I want the whole picture"],
  },
]

// ── Scoring ───────────────────────────────────────────────────────────────────

const OPTION_SCORES: Record<string, number> = {
  // Q1
  "Sports": 2, "Politics": 2, "Pop culture / entertainment": 2,
  "Crypto & markets": 3, "Everything — I have opinions on all of it": 4,
  // Q2
  "Occasionally — when something big is happening": 1,
  "A few times a week": 2, "Every single day": 3,
  "Constantly, without even thinking about it": 4,
  // Q3
  "Never — I have zero receipts": 1,
  "Sometimes, if I yell loud enough": 2,
  "My group chat sort of believes me": 3,
  "I keep mental score myself": 4,
  // Q4
  "No way to track and prove my picks": 2,
  "Nobody believes me without a record": 2,
  "My friends won't commit to a platform": 2,
  "My takes are good but not consistent enough": 3,
  // Q5
  "A verified win rate people can't dispute": 3,
  "Outranking my friends on a leaderboard": 3,
  "A streak record that shows daily consistency": 3,
  "All three — I want the whole picture": 4,
}

type PredictorType = "Rookie" | "Forecaster" | "Analyst"

interface PredictorResult {
  type: PredictorType
  headline: string
  body: string
  plan: string[]
}

function getResult(answers: string[]): PredictorResult {
  const score = answers.reduce((sum, a) => sum + (OPTION_SCORES[a] ?? 0), 0)
  if (score <= 9) return {
    type: "Rookie",
    headline: "You've got opinions. Now get receipts.",
    body: "Your takes are untested — but that's about to change. Ledge gives you the tools to log every call and build a win rate from scratch. A lot of Rookies become Analysts fast.",
    plan: ["Start with 3 markets you're confident in", "Log predictions daily to build your record", "Hit 10 correct calls to unlock Forecaster rank"],
  }
  if (score <= 15) return {
    type: "Forecaster",
    headline: "You're consistent. Now make it undeniable.",
    body: "You already have the instincts. What you're missing is a scoreboard that proves it. Ledge turns every prediction into a logged record your friends can't dispute.",
    plan: ["Your win rate will be tracked from day one", "Challenge friends in Circle markets to settle debates", "Target a 60%+ win rate to reach Analyst rank"],
  }
  return {
    type: "Analyst",
    headline: "You think in probabilities. You just need a stage.",
    body: "You're already ahead of most players. Ledge gives sharp predictors a ranked leaderboard, streak records, and a community that takes accuracy as seriously as you do.",
    plan: ["You're eligible to start at Analyst tier", "Compete against top predictors in open markets", "Build your streak — 7 days unlocks Oracle track"],
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PredictionQuiz() {
  const [step, setStep] = useState<number>(-1)   // -1 = intro
  const [answers, setAnswers] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const isIntro  = step === -1
  const isResult = step === QUESTIONS.length

  function handleNext() {
    if (!selected) return
    const next = [...answers, selected]
    setAnswers(next)
    setSelected(null)
    setStep(step + 1)
  }

  const result = isResult ? getResult(answers) : null

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (isIntro) {
    return (
      <div className="text-center">
        <p className="text-[10px] text-foreground uppercase tracking-widest font-bold mb-3">Free predictor assessment</p>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-4">
          Are you ready to find out your Prediction IQ?
        </h2>
        <p className="text-[#8585A0] text-base leading-relaxed max-w-sm mx-auto mb-10">
          Answer 5 quick questions. We&apos;ll measure your prediction potential across three areas and tell you exactly where to start.
        </p>

        {/* Value proposition — what gets measured */}
        <div className="grid sm:grid-cols-3 gap-4 mb-10 max-w-2xl mx-auto text-left">
          {[
            { icon: BarChart2, label: "Win rate potential", body: "How accurate could your predictions realistically be?" },
            { icon: Map,       label: "Category strength",  body: "Where are you sharpest — sports, politics, or culture?" },
            { icon: Trophy,    label: "Starting rank",      body: "Which Ledge tier should you actually start at?" },
          ].map(({ icon: Icon, label, body }) => (
            <div key={label} className="bg-[#111116] border border-[#2A2A36] p-4" style={{ borderRadius: "12px" }}>
              <Icon className="w-4 h-4 text-foreground mb-2.5" />
              <p className="text-sm font-bold text-[#EBEBEB] mb-1">{label}</p>
              <p className="text-xs text-[#8585A0] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        <button
          onClick={() => setStep(0)}
          className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#0A0A0B] font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-all active:scale-95"
          style={{ borderRadius: "10px" }}
        >
          Start the free quiz
          <ChevronRight className="w-4 h-4" />
        </button>
        <p className="text-[10px] text-[#8585A0]/50 mt-3 uppercase tracking-wider">5 questions · 60 seconds · Free · No signup to see your result</p>
      </div>
    )
  }

  // ── Result ─────────────────────────────────────────────────────────────────
  if (isResult && result) {
    return (
      <div className="text-center max-w-lg mx-auto">
        {/* Big reveal */}
        <div
          className="bg-white/8 border border-white/20 p-8 mb-6"
          style={{ borderRadius: "16px" }}
        >
          <p className="text-[10px] text-foreground uppercase tracking-widest font-bold mb-2">Your predictor type</p>
          <p className="text-5xl font-black text-foreground mb-4 tracking-tight">{result.type}</p>
          <h3 className="text-lg font-black text-[#EBEBEB] mb-3">{result.headline}</h3>
          <p className="text-sm text-[#8585A0] leading-relaxed">{result.body}</p>
        </div>

        {/* 3 insights — your game plan */}
        <div className="bg-[#111116] border border-[#2A2A36] p-5 mb-8 text-left" style={{ borderRadius: "12px" }}>
          <p className="text-[10px] text-foreground uppercase tracking-widest font-bold mb-4">Your personalized game plan</p>
          <ul className="flex flex-col gap-3">
            {result.plan.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-[#B0B0C8]">
                <Check className="w-3.5 h-3.5 text-foreground shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Next step: claim credits */}
        <Link
          href="/auth/signup"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-white text-[#0A0A0B] font-bold text-sm uppercase tracking-wider hover:bg-white/90 transition-all active:scale-95 mb-3"
          style={{ borderRadius: "10px" }}
        >
          Claim your 1,000 CR as a {result.type}
          <ChevronRight className="w-4 h-4" />
        </Link>
        <p className="text-[10px] text-[#8585A0]/50 mt-2 uppercase tracking-wider">Free forever · No credit card</p>
      </div>
    )
  }

  // ── Question ───────────────────────────────────────────────────────────────
  const currentQ = QUESTIONS[step]
  return (
    <div className="max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="flex items-center gap-1.5 mb-8">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i <= step ? "#FFFFFF" : "#2A2A36" }}
          />
        ))}
      </div>

      <p className="text-[10px] text-[#8585A0] uppercase tracking-widest font-bold mb-3">
        Question {step + 1} of {QUESTIONS.length}
      </p>
      <h3 className="text-xl font-black text-[#EBEBEB] mb-6 leading-snug">{currentQ.text}</h3>

      {/* Options */}
      <div className="flex flex-col gap-2 mb-8">
        {currentQ.options.map((option) => (
          <button
            key={option}
            onClick={() => setSelected(option)}
            className="text-left px-4 py-3.5 border text-sm font-medium transition-all"
            style={{
              borderRadius: "10px",
              background: selected === option ? "rgba(255,255,255,0.08)" : "#111116",
              borderColor: selected === option ? "#FFFFFF" : "#2A2A36",
              color: selected === option ? "#FFFFFF" : "#8585A0",
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <button
        onClick={handleNext}
        disabled={!selected}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 font-bold text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          borderRadius: "10px",
          background: "#FFFFFF",
          color: "#0A0A0B",
        }}
      >
        {step === QUESTIONS.length - 1 ? "See my result" : "Next question"}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
