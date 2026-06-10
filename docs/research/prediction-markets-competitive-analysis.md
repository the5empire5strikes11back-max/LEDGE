# Polymarket & Kalshi → Ledge: Competitive Analysis & Application

_Research date: June 2026. Focus: 2024–2026 state of both platforms, applied to Ledge
(free-to-play, virtual-credit, Gen-Z social prediction market — no real money)._

---

## 1. How the real markets actually work

### 1.1 Market microstructure (pricing engine)

Both leaders run a **Central Limit Order Book (CLOB)** — users trade *against each other*,
not against the house. Price is set by supply/demand, not a bookmaker.

- **Shares are priced $0.00–$1.00** (Polymarket) / **1¢–99¢** (Kalshi). A share pays **$1**
  if the outcome is YES, $0 if NO.
- **Price == probability.** A YES share at $0.65 literally means "the market thinks 65%."
  YES + NO prices always sum to ~$1.00. This is the single most important credibility cue:
  the number a user sees *is* the implied probability.
- **Maker/taker model.** Makers post resting limit orders (provide liquidity); takers cross
  the spread (consume it). Tighter spread = more liquid = more believable.
- **Alternative engine — LMSR** (Augur, older designs): an automated market maker that
  *guarantees* liquidity (you can always trade, no counterparty needed). New markets seed
  at **$0.50 / $0.50 (50%)**, and a "liquidity parameter b" controls how fast price moves
  per dollar traded. This matters for Ledge: an order book needs two-sided crowds; an
  AMM/pool works with thin crowds — which is what a young app has.

### 1.2 Resolution & trust (the hard part)

- **Polymarket → UMA Optimistic Oracle.** Anyone proposes the outcome; anyone can dispute
  by posting a **$750 bond**; a **≥2-hour** challenge window; disputes escalate to UMA
  token-holder vote (**4–7 days**). It's decentralized but has had **high-profile failures**
  — e.g. a ~$60–85M dispute over whether "Strategy sold Bitcoin in May" where the oracle
  vote was contested, and documented oracle-manipulation concerns.
- **Kalshi → CFTC-regulated Designated Contract Market.** Resolution tied to **official
  sources** (AP, government data, official scoreboards), with regulatory accountability.
  Slower to list markets, but far more trusted on settlement.
- **Takeaway for Ledge:** resolution *trust* is the entire product. Ambiguous or "vibes"
  resolution is what kills credibility. Ledge already does the right thing — deterministic
  resolution against **official ESPN data + RSS-keyword sources** — which is closer to the
  Kalshi philosophy than Polymarket's.

### 1.3 Fees / revenue

- **Polymarket:** historically 0% trading fees; in 2026 began **taker fees** (peaking ~0.75%
  at the 50/50 price) funding a **maker-rebate** program (makers earn 20–25% of taker fees).
- **Kalshi:** **~7% taker / ~1.75% maker** (a 4:1 ratio to reward liquidity provision), plus
  card deposit/withdrawal fees (ACH free).
- **Takeaway for Ledge:** Ledge has **no real-money fees** — so this maps to its **virtual
  economy sinks** (credit shop, Ledge Plus). The maker/taker *idea* still applies as a
  gamified mechanic (reward users who bet early / "provide liquidity" to thin markets).

### 1.4 Categories & what's winning

- Real coverage: **politics, economics (Fed/CPI/jobs), sports, entertainment/culture,
  weather, crypto.**
- **2024:** politics dominated — Polymarket did **$3.68B** on the US presidential election
  (largest prediction-market event ever); politics was ~90% of Kalshi and ~65% of Polymarket
  volume around the election.
- **2025–26 shift:** **sports overtook everything.** Sports is now **~65% of Kalshi volume**,
  and Kalshi **flipped the duopoly** — from <10% share to **~60%**, ~$50B annualized volume,
  ~$260M revenue (10× YoY). Sports is the growth engine because it's *frequent, recurring,
  and emotional* — exactly Ledge's wheelhouse.

### 1.5 UX & growth

- **Kalshi UX:** clean, beginner-friendly, category-grouped, "pick market → YES/NO → amount →
  confirm." Regulated banking rails.
- **Polymarket UX:** a "trading terminal in your pocket" — live charts, implied probabilities,
  fast execution, social logins (Google/Apple auto-create a wallet). Crypto-native feel.
- **Native social features are thin on both.** Leaderboards, copy-trading, watchlists, and
  alerting mostly come from **third-party tools** (Rainmaker, Markium, etc.), not the core
  apps. **This is the gap Ledge is built to own.**
- **Gen-Z pull (the real driver):** young users say prediction markets make "doomscrolling
  TikTok and tracking celebrity drama feel like *market research*," and that they "know
  something the experts don't." Gamification (leaderboards, badges, avatars, challenges) and
  **meme-native marketing** are explicitly what pull them in. **~69% of real-money accounts
  lose money** — the ethical cliff Ledge sidesteps by being free-to-play.

---

## 2. What Ledge should apply — with the Ledge twist

> Principle: **borrow the *credibility surface* of a real market, keep the *emotional surface*
> of a social game.** Make it *look and resolve* like Polymarket/Kalshi; make it *feel* like
> BeReal × a group chat × a sports app.

### A. Price == probability, everywhere (highest-impact credibility win)
Real markets' core trust cue is "the % you see is the implied probability, YES+NO=100%."
- **Apply:** show every market as a **YES probability % that is the actual implied price**,
  with a live order-book-style "X% YES / (100−X)% NO" and a spread/odds readout.
- **Ledge twist:** Ledge already computes `yes_percent` from pools + **virtual liquidity**.
  Lean in: label the early number **"System estimate"** (you already do via `starter_probability`)
  then flip to **"Crowd odds"** once real bets arrive — a transparency move neither competitor
  makes. Add a tiny **"implied payout"** ("65% → 1.54× if YES") so the probability and the
  reward are visibly linked, like a real share price.

### B. Use an AMM/pool, not an order book (you already do — make it the *story*)
A 3-month-old app cannot fill a two-sided order book; thin books look broken.
- **Apply:** keep the **pool/AMM model with virtual liquidity seeding** (Ledge's `seedLiquidity`)
  so every market is instantly tradable at a believable 50/50-ish open — exactly how LMSR
  markets seed.
- **Ledge twist:** surface a **"liquidity" / "heat"** meter per market (you have `hot_score`)
  framed as depth. Reward **early bettors in thin markets** with a small XP/credit "**market
  maker bonus**" — gamifies the maker/taker concept without real fees.

### C. A believable price chart + movement
Polymarket's stickiness is *watching the line move* during live events.
- **Apply:** you already store odds history and render a sparkline/area chart in
  `market-detail.tsx`. Push it harder: **live ticking odds**, "**+8% in the last hour**"
  momentum chips (you have `momentum_shift`), and a "**biggest movers**" rail.
- **Ledge twist:** a **"crowd vs you"** overlay — plot where *your friends/circle* are vs the
  global crowd. Turns a finance chart into social tension.

### D. Resolution trust as a first-class, visible feature
This is where Polymarket bleeds credibility and Kalshi wins. Ledge should copy *Kalshi's*
philosophy, not Polymarket's.
- **Apply:** on every market show the **resolution source up front** ("Resolves via official
  ESPN box score" / "Resolves from BBC headline") and a **resolution log** when it settles —
  who/what decided it, timestamp, the data snapshot. You already resolve deterministically
  against ESPN + RSS; *show it*.
- **Ledge twist:** a lightweight **"dispute / flag"** button (à la UMA's challenge window) that
  costs a few credits and routes to your existing `market_disputes` table — community trust
  theater, with zero real-money risk. Badge markets **"Auto-resolved ✓ from official source."**

### E. Categories: go where the energy is — sports first, culture second
The market data is unambiguous: **sports is the growth engine**, culture/entertainment is the
Gen-Z hook, politics is volatile and seasonal.
- **Apply:** weight inventory toward **sports + pop-culture** (you already bias Sports-heavy and
  drop finance/politics jargon in the generator). Keep politics to *only* hot, viral, emotional
  events.
- **Ledge twist:** **micro-markets on culture** real platforms won't touch — "Will [artist]
  tease the album this week?", "Will [streamer] hit X?", "Will the finale kill off [character]?"
  This is Ledge's moat: faster, sillier, more personal than a regulated exchange can be.

### F. Social layer = the whole differentiator (the gap both leaders left open)
Native social is thin on Polymarket/Kalshi; it's bolted on by third parties.
- **Apply / extend what Ledge has:** feed, circles, following, comments, leaderboard, personas.
- **Ledge twist — make positions social objects:**
  - **Copy-bet / "tail" a friend** (Polymarket users *want* copy-trading; no one ships it
    natively). "Tail @maya's YES" in one tap.
  - **Shareable bet cards** (you have win/loss cards) → make *open* positions shareable too:
    "I'm 500cr on YES — fade me."
  - **Circle markets & leaderboards** (you have circles) — group-chat-native betting pools.
  - **"Conviction"** — let users stake credits *and* a public take/comment; the feed becomes
    opinions with skin in the game, not just numbers.

### G. Gamified economy instead of fees
Real markets monetize via fees/spread; Ledge monetizes engagement + Plus.
- **Apply:** keep daily drops, streaks, XP, ranks, mystery chests, Ledge Plus (all present).
- **Ledge twist:** tie the **virtual economy to "market-making"** — earn credits for betting
  early, for markets you created getting volume (you have creator markets/trust), for being
  *calibrated* (you have a calibration section). **Reward being right *and* being early**,
  the two things real LPs get paid for.

### H. The "you know something experts don't" hook
The #1 psychological driver for Gen Z. Lean into it explicitly.
- **Ledge twist:** a **"Called it" / accuracy identity**: per-category calibration badges
  (you already compute calibration), "**You beat the crowd on 7 of your last 10**", a public
  **track record** on profiles. Make *being right* the flex, not *how much you wagered*.

---

## 3. What to deliberately NOT copy

| Real-market feature | Why Ledge should skip / invert it |
|---|---|
| **Real money / cash-out** | The whole legal + ethical safety of Ledge. ~69% of real-money accounts *lose money*; staying virtual is the moat, not a limitation. Never add withdrawal. |
| **Order book as the core UX** | Thin two-sided books look broken at Ledge's scale and confuse Gen-Z. Keep the AMM/pool. |
| **UMA-style crypto oracle & on-chain settlement** | Slow, expensive, manipulable, and has caused public $60M+ disputes. Ledge's deterministic ESPN/RSS resolution is *better* for trust. |
| **High taker fees / spread extraction** | No real money = no fees. Don't simulate a "rake" that makes users feel nickel-and-dimed. |
| **Finance/econ markets (CPI, Fed, EPS)** | Already correctly banned in Ledge's generator — Gen-Z bounce. |
| **Pure individual trading-terminal loneliness** | Polymarket/Kalshi are solitary. Ledge's reason to exist is the *opposite*: social, shared, group-chat energy. |
| **"Get rich / financially behind" framing** | The dark pattern regulators are circling (the "Joe Camel moment" critique). Ledge should frame around *being right & flexing*, not *making money*. |

---

## 4. Priority recommendations (mapped to Ledge's codebase)

1. **Probability-first market cards** — make the displayed YES% explicitly the implied price,
   add implied-payout multiplier, "System estimate → Crowd odds" transition. _(market-feed-card,
   market-detail)_
2. **Resolution transparency** — show source up front + post-resolution log + "auto-resolved
   from official source" badge; wire the flag/dispute button to `market_disputes`.
3. **Tail / copy-bet** — one-tap copy a friend's position; the single most-wanted real-market
   feature no one ships natively. _(feed + bet flow + following)_
4. **Sports-weighted, culture-rich inventory** with ultra-timely micro-markets _(generator —
   already biased; push culture micro-markets)_.
5. **Market-maker gamification** — early-bettor/creator-volume/calibration credit rewards;
   reframe the economy around "right + early." _(game-engine, daily-drop, creator trust)_
6. **"Called it" identity** — public calibrated track record + per-category accuracy badges as
   the core flex. _(profile, calibration, leaderboard)_

---

## Sources

- [Polymarket Docs — Prices & Orderbook](https://docs.polymarket.com/concepts/prices-orderbook)
- [Polymarket CLOB explained (QuantVPS)](https://www.quantvps.com/blog/polymarket-clob-central-limit-order-book)
- [How Polymarket Works — the tech (Rock'n'Block)](https://rocknblock.io/blog/how-polymarket-works-the-tech-behind-prediction-markets)
- [Polymarket Resolution / UMA Docs](https://docs.polymarket.com/developers/resolution/UMA)
- [How Polymarket markets resolve — UMA, claims & disputes](https://startpolymarket.com/learn/how-markets-resolve/)
- [$60M Polymarket/UMA Bitcoin dispute (The Defiant)](https://thedefiant.io/news/markets/usd85m-polymarket-dispute-over-strategy-s-may-bitcoin-sale-puts-uma-s-token-voting-oracle-on)
- [Oracle manipulation in prediction markets (Orochi)](https://orochi.network/blog/oracle-manipulation-in-polymarket-2025)
- [Polymarket Maker Rebates Program (docs)](https://docs.polymarket.com/polymarket-learn/trading/maker-rebates-program)
- [Polymarket fees 2026](https://startpolymarket.com/learn/polymarket-fees/)
- [Kalshi — how prediction markets work](https://news.kalshi.com/p/how-prediction-markets-work)
- [Kalshi regulation (Market Integrity Hub)](https://kalshi.com/market-integrity/regulation)
- [What is Kalshi? (Built In)](https://builtin.com/articles/what-is-kalshi)
- [Kalshi fee structure explained (Polytrage)](https://blog.polytrage.com/kalshis-fee-structure-explained/)
- [Kalshi — Wikipedia](https://en.wikipedia.org/wiki/Kalshi)
- [Polymarket vs Kalshi (Sacra)](https://sacra.com/research/polymarket-vs-kalshi/)
- [Prediction markets duopoly 2025 (The Block)](https://www.theblock.co/post/383733/prediction-markets-kalshi-polymarket-duopoly-2025)
- [Prediction-market trading volume soared (Pew Research)](https://www.pewresearch.org/short-reads/2026/05/27/trading-volume-on-prediction-markets-has-soared-in-recent-months/)
- [Kalshi vs Polymarket apps compared (next.io)](https://next.io/prediction-markets/guide/kalshi-vs-polymarket/)
- [LMSR explained (Gensyn)](https://blog.gensyn.ai/lmsr-logarithmic-market-scoring-rule/)
- [Pricing mechanism behind prediction markets (Gate Learn)](https://www.gate.com/learn/articles/the-pricing-mechanism-behind-prediction-markets/5444)
- [Gen Z's "Joe Camel moment" (Fortune)](https://fortune.com/2026/05/28/prediction-markets-gen-z-joe-camel-memes-kalshi-polymarket/)
- [Gen Z & millennials turning to prediction markets (CNBC)](https://www.cnbc.com/2026/05/05/gen-z-millennials-prediction-markets.html)
- [Gamification & memes lure young users (Washington Post)](https://www.washingtonpost.com/business/2026/05/28/sports-betting-prediction-markets-memes-gamification/219b39a4-5a7c-11f1-8a9d-afb1148204e1_story.html)
