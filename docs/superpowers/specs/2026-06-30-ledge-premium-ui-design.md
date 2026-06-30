# Ledge Premium UI Pass — Design Spec

Date: 2026-06-30
Status: Approved direction, ready for implementation plan
Owner: Sebastian Jimenez

## Goal

Elevate Ledge from "well built dark app" to "premium product" without a teardown.
The current design system is solid; this pass adds craft: a refined typeface, soft
whites, real depth, subtle texture, and disciplined motion. Direction chosen:
**Refined fintech** (Linear / Vercel / Stripe energy), approved against a rendered
before/after of the market card.

## Non-goals

- No change to functionality, data, or layout structure.
- No change to the green/red semantic system or the YES/NO buttons (already approved).
- No change to the category system, routing, or backend.
- Not a feature; this is pure visual craft.

## Locked visual language

### 1. Typography
- UI text: **Hanken Grotesk** (replaces Space Grotesk) via `next/font/google`.
- Numbers (odds, %, credits, countdowns): **JetBrains Mono** stays.
- One family, two roles. Disciplined weight/size hierarchy is the premium signal.

### 2. Soft white
- Primary text routes through one `--foreground` token at a calm off white (~#ECECEF).
- Remove hardcoded pure `#FFFFFF` / `text-white` from text usages (17 files).
- White stays only as the accent **fill** on primary buttons (`--accent`), never as body text.

### 3. Depth
- Cards lift off the page: soft drop shadow + 1px top highlight.
- New reusable treatment so every card inherits it.
- Tokens:
  - `--shadow-card: 0 14px 34px -14px rgba(0,0,0,0.7);`
  - `--shadow-card-top: inset 0 1px 0 0 rgba(255,255,255,0.06);`
  - `.card-elevated` utility = card bg + 1px border `rgba(255,255,255,0.09)` + radius + both shadows.

### 4. Texture
- One global grain overlay over the app background: SVG `feTurbulence` data URI,
  `pointer-events:none`, ~4% opacity, fixed, behind content.

### 5. Corners
- `--radius-card`: 8px → 12px
- `--radius-button`: 6px → 10px
- Sheets stay 12px (already premium).

### 6. Motion (uses existing tokens)
- Feed cards stagger in on load via existing `.card-enter` (animation-delay per index).
- Cards lift + border brighten on hover (desktop) via `.card-interactive`.
- Odds keep the number ticker; bet confirm keeps `flash-success`.

## Foundation changes (do first)

- `app/layout.tsx`: import Hanken Grotesk, set `--font-hanken`, apply to `<html>`.
- `app/globals.css`:
  - `--font-sans` → `'Hanken Grotesk', system-ui, sans-serif`.
  - Add depth tokens + `.card-elevated` utility.
  - Bump `--radius-card` and `--radius-button`.
  - Add global grain overlay (body pseudo-element or a layout-level fixed div).
  - Confirm `--foreground` is the soft white all text resolves to.

## Per-screen / component application

Apply the language after the foundation lands. Each ships only after a rendered check.

1. `components/market-feed-card.tsx` — elevated card, soft white, tighter hierarchy (the approved mockup).
2. `components/screens/feed-screen.tsx` — staggered entry, refined section labels.
3. `components/screens/profile-screen.tsx` — refined metric blocks, streak flame, rank badges.
4. `components/screens/circles-screen.tsx` — same card language.
5. `app/page.tsx` (nav / sidebar) — soft white, refined active states.
6. `app/landing/page.tsx` — hero headline in Hanken, refined spacing.
7. Modals: `shop-modal.tsx`, `settings-sheet.tsx`, buy-credits — elevated surfaces, consistent type.
8. `app/onboarding`, `app/auth` — consistent type + soft white.

## Stays exactly the same
Green/red meaning, YES/NO buttons, every feature, all data, layout structure, category system.

## Implementation order & gates
1. Foundation (font, soft white token, depth tokens, grain, radius).
2. Market feed card.
3. Feed screen (render the real feed, screenshot, confirm, deploy).
4. Profile, circles.
5. Nav/sidebar, modals, onboarding/auth.
6. Landing.

Each step: edit → build check → render the real screen → show Sebastian → deploy
(commit + push + `vercel --prod`) per his standing rule, only after he sees it.

## Cleanup
- Remove `public/_premium-preview.html` (temporary brainstorming mockup; must not ship).
- Stop the temporary static preview server.

## Verification
- `next build` stays green after each step.
- Render each changed screen via the dev server (or headless screenshot) before deploy.
- Spot check both mobile (390px) and desktop widths.
- Confirm no pure-white text remains via grep for `text-white` / `#FFFFFF` in text contexts.
