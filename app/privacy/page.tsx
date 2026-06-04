import type { Metadata } from "next"
import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Privacy Policy — Ledge",
  description: "How Ledge collects, uses, and protects your information.",
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your information."
      lastUpdated="June 2025"
      sections={[
        {
          heading: "1. What Ledge is",
          body: (
            <>
              <p>
                Ledge is a free-to-play social prediction market app. You make predictions using virtual credits
                that have no monetary value and cannot be exchanged for cash or prizes. No real money is
                involved at any point.
              </p>
              <p>
                This policy explains what personal information we collect when you use Ledge, why we collect it,
                and how we handle it.
              </p>
            </>
          ),
        },
        {
          heading: "2. Information we collect",
          body: (
            <ul className="list-disc list-inside space-y-1.5">
              <li>
                <strong className="text-foreground/80">Account info</strong> — your email address, username,
                and password (stored as a secure hash by our authentication provider, Supabase).
              </li>
              <li>
                <strong className="text-foreground/80">Profile data</strong> — your chosen username, optional
                profile avatar, XP, credits, and streak count.
              </li>
              <li>
                <strong className="text-foreground/80">Gameplay data</strong> — every prediction (bet) you make,
                including which market, which side, and the amount wagered in virtual credits.
              </li>
              <li>
                <strong className="text-foreground/80">Device and usage data</strong> — pages visited, features
                used, and basic device information (browser type, OS), collected automatically via Vercel Analytics.
                This data is aggregated and anonymised.
              </li>
              <li>
                <strong className="text-foreground/80">Error reports</strong> — if the app crashes or encounters
                an error, a report is sent to Sentry (our error-tracking tool) that may include a stack trace
                and the action you were performing. It does not include your password.
              </li>
              <li>
                <strong className="text-foreground/80">Push notification tokens</strong> — if you opt in to push
                notifications, we store a device token so we can send you alerts. You can revoke this at any time
                in your device settings.
              </li>
              <li>
                <strong className="text-foreground/80">Session cookies</strong> — Supabase sets a secure,
                HTTP-only authentication cookie to keep you signed in. We do not use advertising or
                tracking cookies.
              </li>
            </ul>
          ),
        },
        {
          heading: "3. Why we collect it",
          body: (
            <ul className="list-disc list-inside space-y-1.5">
              <li>To create and manage your account.</li>
              <li>To run the game and track your credits, XP, streak, and predictions.</li>
              <li>To show you leaderboards and social features (circles, activity feeds).</li>
              <li>To send push notifications you have opted into.</li>
              <li>To diagnose and fix bugs via error reporting.</li>
              <li>To understand how people use the app so we can improve it (aggregate analytics only).</li>
            </ul>
          ),
        },
        {
          heading: "4. Who we share it with",
          body: (
            <>
              <p>We do not sell your personal data. We share it only with the service providers needed to operate Ledge:</p>
              <ul className="list-disc list-inside space-y-1.5 mt-2">
                <li>
                  <strong className="text-foreground/80">Supabase</strong> — stores your account, profile, and
                  gameplay data in a managed Postgres database with row-level security.
                  <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ml-1">Privacy policy ↗</a>
                </li>
                <li>
                  <strong className="text-foreground/80">Vercel</strong> — hosts the app and collects
                  anonymised analytics on page views and feature usage.
                  <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ml-1">Privacy policy ↗</a>
                </li>
                <li>
                  <strong className="text-foreground/80">Sentry</strong> — receives crash reports and error
                  traces to help us fix bugs.
                  <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ml-1">Privacy policy ↗</a>
                </li>
                <li>
                  <strong className="text-foreground/80">Anthropic (Claude AI)</strong> — used server-side to
                  generate prediction market questions from public news headlines. Your personal data is not
                  sent to Anthropic.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: "5. How long we keep your data",
          body: (
            <ul className="list-disc list-inside space-y-1.5">
              <li>
                <strong className="text-foreground/80">Account and gameplay data</strong> — kept for as long as
                your account is active. If you request deletion, we remove it within 30 days.
              </li>
              <li>
                <strong className="text-foreground/80">Error logs (Sentry)</strong> — retained for up to 90 days,
                then automatically purged.
              </li>
              <li>
                <strong className="text-foreground/80">Anonymised analytics</strong> — retained indefinitely in
                aggregated form (no individual identifiers).
              </li>
              <li>
                <strong className="text-foreground/80">Push notification tokens</strong> — kept until you revoke
                notification permission or delete your account.
              </li>
            </ul>
          ),
        },
        {
          heading: "6. Your rights and choices",
          body: (
            <>
              <p>You can:</p>
              <ul className="list-disc list-inside space-y-1.5 mt-2">
                <li>Access your profile and gameplay history in the app at any time.</li>
                <li>Turn off push notifications in your device settings.</li>
                <li>
                  Request a copy of your data or ask us to delete your account and associated data by emailing
                  us at{" "}
                  {/* REVIEW: replace with your actual support/privacy email before launch */}
                  <a href="mailto:privacy@ledge.app" className="text-accent hover:underline">
                    privacy@ledge.app
                  </a>
                  . We will respond within 30 days.
                </li>
              </ul>
              <p className="mt-3">
                We will delete your account data upon request, subject to any data we are legally required to retain.
                Because Ledge uses only virtual credits with no monetary value, there are no financial records to retain.
              </p>
            </>
          ),
        },
        {
          heading: "7. Children",
          body: (
            <p>
              Ledge is intended for users aged 13 and older. We do not knowingly collect personal information from
              children under 13. If you believe a child under 13 has created an account, please contact us at{" "}
              {/* REVIEW: replace with your actual support email */}
              <a href="mailto:privacy@ledge.app" className="text-accent hover:underline">privacy@ledge.app</a>
              {" "}and we will remove the account promptly.
            </p>
          ),
        },
        {
          heading: "8. Security",
          body: (
            <p>
              Passwords are never stored in plaintext — they are hashed by Supabase. Data in transit is encrypted
              via HTTPS. We use row-level security policies in our database to ensure users can only access their
              own data. No security system is perfect, but we take reasonable measures to protect your information.
            </p>
          ),
        },
        {
          heading: "9. Changes to this policy",
          body: (
            <p>
              If we make material changes to this policy, we will update the "last updated" date above. For
              significant changes we will also notify users via in-app notification. Continued use of Ledge after
              a policy change means you accept the updated terms.
            </p>
          ),
        },
        {
          heading: "10. Contact",
          body: (
            <p>
              Questions or requests about your privacy? Email us at{" "}
              {/* REVIEW: replace with your actual support/privacy email */}
              <a href="mailto:privacy@ledge.app" className="text-accent hover:underline">
                privacy@ledge.app
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  )
}
