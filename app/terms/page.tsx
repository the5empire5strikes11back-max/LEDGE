import type { Metadata } from "next"
import { LegalPage } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Terms of Service — Ledge",
  description: "The rules for using Ledge, the free-to-play social prediction market.",
}

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      subtitle="The rules for using Ledge. Please read them — they're short."
      lastUpdated="June 2025"
      sections={[
        {
          heading: "1. What Ledge is",
          body: (
            <>
              <p>
                Ledge is a free-to-play social prediction market app. You earn and spend <strong className="text-foreground/80">virtual credits</strong> — a
                points system that exists only inside the game. Virtual credits have no monetary value, cannot be
                transferred to real money, and cannot be redeemed for cash, goods, or prizes of any kind.
              </p>
              <p>
                Ledge is entertainment, not gambling. No real money ever changes hands.
              </p>
            </>
          ),
        },
        {
          heading: "2. Eligibility",
          body: (
            <p>
              You must be at least <strong className="text-foreground/80">13 years old</strong> to use Ledge.
              By creating an account you confirm that you meet this requirement. If you are under 18, you should
              review these terms with a parent or guardian.
            </p>
          ),
        },
        {
          heading: "3. Your account",
          body: (
            <ul className="list-disc list-inside space-y-1.5">
              <li>You may only create one account per person.</li>
              <li>You are responsible for keeping your password secure and for all activity on your account.</li>
              <li>Your username must not impersonate another person, brand, or public figure.</li>
              <li>You agree to provide accurate information when signing up.</li>
              <li>
                If you believe your account has been compromised, contact us immediately at{" "}
                {/* REVIEW: replace with your actual support email */}
                <a href="mailto:support@ledge.app" className="text-accent hover:underline">support@ledge.app</a>.
              </li>
            </ul>
          ),
        },
        {
          heading: "4. Virtual credits and gameplay",
          body: (
            <>
              <p>
                When you sign up, you receive <strong className="text-foreground/80">5,000 free virtual credits</strong> to start playing. You earn more
                credits by predicting correctly, maintaining streaks, and claiming daily drops.
              </p>
              <ul className="list-disc list-inside space-y-1.5 mt-2">
                <li>Virtual credits have zero real-world monetary value.</li>
                <li>Credits are non-transferable and cannot be sold, traded, or withdrawn.</li>
                <li>
                  We may adjust credit balances, correct errors, or reset accounts if we detect abuse or
                  manipulation of the credit system.
                </li>
                <li>
                  We may modify, suspend, or discontinue the virtual credit system or any game mechanic at
                  any time without notice or liability.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: "5. Prediction markets",
          body: (
            <>
              <p>
                Markets are yes/no prediction questions about real-world events. They are generated automatically
                from public news or created by users. A few things to know:
              </p>
              <ul className="list-disc list-inside space-y-1.5 mt-2">
                <li>
                  <strong className="text-foreground/80">Resolution is automated where possible</strong> and manual
                  otherwise. Our decisions on how a market resolves are final.
                </li>
                <li>
                  Markets may be cancelled, voided, or re-resolved if we determine there was an error, ambiguity,
                  or manipulation. Virtual credits staked on a voided market are returned to your balance.
                </li>
                <li>
                  Markets involving real-world events depend on public information. We make no guarantee that
                  any market will resolve within any particular timeframe.
                </li>
                <li>
                  User-created markets are subject to review and may be removed if they violate these terms.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: "6. Acceptable use",
          body: (
            <>
              <p>You agree not to:</p>
              <ul className="list-disc list-inside space-y-1.5 mt-2">
                <li>Use automated tools, bots, or scripts to interact with Ledge.</li>
                <li>Exploit bugs or glitches to gain unfair credit advantages. (Report them to us instead.)</li>
                <li>Create prediction markets that are deliberately misleading, illegal, or harassing.</li>
                <li>Attempt to reverse-engineer, scrape, or disrupt the Ledge service.</li>
                <li>Share or post content that is hateful, sexually explicit, or illegal.</li>
                <li>
                  Use Ledge in any way that violates applicable law in your jurisdiction.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: "7. User-generated content",
          body: (
            <p>
              If you create markets or post content on Ledge, you grant us a non-exclusive, worldwide, royalty-free
              licence to display and use that content within the app. You are responsible for the content you create.
              We reserve the right to remove content that violates these terms or that we find objectionable,
              at our sole discretion.
            </p>
          ),
        },
        {
          heading: "8. Limitation of liability",
          body: (
            <>
              <p>
                Ledge is provided <strong className="text-foreground/80">"as is"</strong> without warranties of any kind.
                We do not guarantee that the service will be uninterrupted, error-free, or that any particular market
                will resolve accurately or on time.
              </p>
              <p>
                Because Ledge involves only virtual credits with no monetary value, our total liability to you for any
                claim arising from your use of the service is limited to zero dollars. This does not affect any
                statutory rights you may have that cannot be waived.
              </p>
            </>
          ),
        },
        {
          heading: "9. Account termination",
          body: (
            <>
              <p>
                <strong className="text-foreground/80">You can delete your account</strong> at any time by contacting
                us at{" "}
                {/* REVIEW: replace with your actual support email */}
                <a href="mailto:support@ledge.app" className="text-accent hover:underline">support@ledge.app</a>.
                We will delete your account and associated personal data within 30 days.
              </p>
              <p>
                We may suspend or permanently ban accounts that violate these terms, at our discretion, without
                prior notice. Because virtual credits have no monetary value, there is no compensation for credits
                lost due to an account ban.
              </p>
            </>
          ),
        },
        {
          heading: "10. Changes to these terms",
          body: (
            <p>
              We may update these terms from time to time. If we make significant changes, we will notify you via
              in-app notification. The "last updated" date at the top of this page always reflects the most recent
              version. Continued use of Ledge after a change means you accept the updated terms.
            </p>
          ),
        },
        {
          heading: "11. Governing law",
          body: (
            <p>
              {/* REVIEW: replace with the actual jurisdiction before launch */}
              These terms are governed by the laws of <strong className="text-foreground/80">[JURISDICTION — e.g. the State of California, USA]</strong>.
              Any disputes will be handled in the courts of that jurisdiction unless applicable law requires otherwise.
            </p>
          ),
        },
        {
          heading: "12. Contact",
          body: (
            <p>
              Questions about these terms? Email us at{" "}
              {/* REVIEW: replace with your actual support email */}
              <a href="mailto:support@ledge.app" className="text-accent hover:underline">
                support@ledge.app
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  )
}
