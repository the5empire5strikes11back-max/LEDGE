/**
 * accent-theme.ts
 *
 * Applies a full OKLCH-inspired accent theme: changes the interactive accent
 * colour AND lightly tints every neutral surface with the accent hue.
 *
 * Technique mirrors the video's Layer-4 rule:
 *   "For every neutral, drop lightness by 0.003 and increase chroma by 0.02,
 *    then shift hue to match your accent."
 *
 * We approximate this in sRGB by blending each base neutral with the accent at
 * a small strength (2-5%). The result is that backgrounds, borders, and cards
 * feel cohesive with the chosen accent without looking tinted.
 */

/** Base neutral values that match the globals.css defaults. */
const BASE = {
  background:   '#0A0A0B',
  surface:      '#111116',
  surface2:     '#18181F',
  secondary:    '#202028',
  border:       '#2A2A36',
  borderSubtle: '#1C1C24',
  sidebar:      '#0D0D10',
} as const

/** Foreground colour (text on accent) per accent hex. */
export const ACCENT_COLORS = [
  { name: 'White',  value: '#FFFFFF', fg: '#0A0A0B' },
  { name: 'Blue',   value: '#3B82F6', fg: '#ffffff' },
  { name: 'Green',  value: '#22C55E', fg: '#0A0A0B' },
  { name: 'Purple', value: '#8B5CF6', fg: '#ffffff' },
  { name: 'Red',    value: '#EF4444', fg: '#ffffff' },
  { name: 'Pink',   value: '#EC4899', fg: '#ffffff' },
  { name: 'Cyan',   value: '#06B6D4', fg: '#0A0A0B' },
  { name: 'Amber',  value: '#F5A623', fg: '#0A0A0B' },
] as const

export type AccentColor = typeof ACCENT_COLORS[number]

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function mix(base: string, accent: string, strength: number): string {
  const [br, bg, bb] = hexToRgb(base)
  const [ar, ag, ab] = hexToRgb(accent)
  const r = Math.round(br + (ar - br) * strength)
  const g = Math.round(bg + (ag - bg) * strength)
  const b = Math.round(bb + (ab - bb) * strength)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Apply a full accent theme to the document root.
 * Call on mount (reads localStorage) and on every user accent change.
 */
export function applyAccentTheme(accent: string): void {
  const found = ACCENT_COLORS.find((c) => c.value === accent)
  const fg = found?.fg ?? '#0A0A0B'
  const el = document.documentElement

  // ── Accent ──
  el.style.setProperty('--accent',            accent)
  el.style.setProperty('--accent-foreground', fg)
  el.style.setProperty('--primary',           accent)
  el.style.setProperty('--primary-foreground',fg)
  el.style.setProperty('--ring',              accent)
  el.style.setProperty('--sidebar-ring',      accent)
  el.style.setProperty('--sidebar-primary',   accent)
  el.style.setProperty('--sidebar-primary-foreground', fg)

  // ── Tinted neutrals (OKLCH chroma injection approximated in sRGB) ──
  // Strengths are deliberately small — the goal is cohesion, not tint visibility.
  const s = 0.04  // base strength

  const bg         = mix(BASE.background,   accent, s * 0.4)
  const surface    = mix(BASE.surface,      accent, s)
  const surface2   = mix(BASE.surface2,     accent, s)
  const secondary  = mix(BASE.secondary,    accent, s * 1.2)
  const border     = mix(BASE.border,       accent, s * 0.7)
  const borderSub  = mix(BASE.borderSubtle, accent, s * 0.4)
  const sidebarBg  = mix(BASE.sidebar,      accent, s * 0.6)

  el.style.setProperty('--background',    bg)
  el.style.setProperty('--surface',       surface)
  el.style.setProperty('--card',          surface)
  el.style.setProperty('--surface-2',     surface2)
  el.style.setProperty('--popover',       surface2)
  el.style.setProperty('--secondary',     secondary)
  el.style.setProperty('--muted',         secondary)
  el.style.setProperty('--border',        border)
  el.style.setProperty('--border-subtle', borderSub)
  el.style.setProperty('--input',         border)
  el.style.setProperty('--sidebar',       sidebarBg)
  el.style.setProperty('--sidebar-accent',secondary)
  el.style.setProperty('--sidebar-border',border)
}

/** Returns the saved accent from localStorage, migrating legacy amber to white. */
export function getSavedAccent(): string {
  if (typeof window === 'undefined') return '#FFFFFF'
  const saved = localStorage.getItem('ledge_accent')
  if (!saved || saved === '#F5A623' || saved === '#FFD700') {
    localStorage.setItem('ledge_accent', '#FFFFFF')
    return '#FFFFFF'
  }
  return saved
}

/** Saves and applies the chosen accent. */
export function saveAndApplyAccent(accent: string): void {
  localStorage.setItem('ledge_accent', accent)
  applyAccentTheme(accent)
}
