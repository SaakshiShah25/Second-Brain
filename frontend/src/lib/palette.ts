// palette.ts — the user's chosen color palette (Settings > Appearance).
// Device-local only (localStorage), unlike theme/font-size which sync
// server-side via user_preference - there's no backend column for this
// yet, and a look/feel pick like this doesn't need to follow the account
// across devices the way an accessibility setting (font size) does.

export type Palette = 'confia' | 'coral' | 'teal' | 'periwinkle' | 'apple-blue' | 'apple-notes'

const STORAGE_KEY = 'confia_palette'
const DEFAULT_PALETTE: Palette = 'confia'

export const PALETTE_OPTIONS: { value: Palette; label: string; description: string; bg: string; accent: string }[] = [
  { value: 'confia', label: 'Confía', description: 'The default indigo/amber look.', bg: '#211e36', accent: '#e9a73b' },
  { value: 'coral', label: 'Warm Coral', description: 'Cream ground, terracotta accent.', bg: '#fffcf7', accent: '#e1652d' },
  { value: 'teal', label: 'Fresh Teal', description: 'Cool white, emerald-teal accent.', bg: '#f7faf9', accent: '#1c9270' },
  { value: 'periwinkle', label: 'Soft Periwinkle', description: 'A lighter take on Confía’s own indigo.', bg: '#fdfcff', accent: '#6459c9' },
  { value: 'apple-blue', label: 'Apple System Blue', description: 'Apple’s own HIG system colors.', bg: '#f2f2f7', accent: '#007aff' },
  { value: 'apple-notes', label: 'Apple Notes Neutral', description: 'Quiet neutrals, a yellow accent.', bg: '#f9f9f9', accent: '#ffd60a' },
]

export function getStoredPalette(): Palette {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (PALETTE_OPTIONS.find((p) => p.value === stored)?.value ?? DEFAULT_PALETTE)
  } catch {
    return DEFAULT_PALETTE
  }
}

export function setStoredPalette(palette: Palette) {
  try {
    localStorage.setItem(STORAGE_KEY, palette)
  } catch {
    // localStorage unavailable (private browsing, blocked site data) -
    // the pick still applies for this session via applyPalette below,
    // it just won't persist across a reload.
  }
}

export function applyPalette(palette: Palette) {
  document.documentElement.dataset.palette = palette
}
