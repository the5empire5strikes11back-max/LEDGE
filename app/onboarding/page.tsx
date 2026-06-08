"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { InterestQuiz } from "@/components/onboarding/interest-quiz"

export default function OnboardingPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function saveAndContinue(selectedIds: string[]) {
    setIsSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('profiles')
          .update({ interests: selectedIds, onboarding_done: true })
          .eq('id', user.id)
      }
    } finally {
      setIsSubmitting(false)
      router.replace('/')
    }
  }

  async function skip() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ onboarding_done: true })
        .eq('id', user.id)
    }
    router.replace('/')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-8">
        {/* Logo + welcome */}
        <div className="flex flex-col items-center gap-4">
          <img
            src="/icon.svg"
            alt="Ledge"
            className="w-16 h-16"
            style={{ borderRadius: "18px" }}
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Welcome to Ledge</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Let&apos;s personalise your feed in 30 seconds.
            </p>
          </div>
        </div>

        <InterestQuiz
          onComplete={saveAndContinue}
          onSkip={skip}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  )
}
