import {
  Briefcase,
  Compass,
  Dumbbell,
  Flag,
  GraduationCap,
  HeartPulse,
  Home,
  Layers,
  Plane,
  Rocket,
  Sparkles,
  Star,
  Target,
  User,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

// Every initiative is a free-text name the user typed ("Fitness", "Job",
// "Tenaxis AI") - there's no fixed category enum to switch on, so this
// keyword-matches against common life-area words to guess an icon, and
// separately either uses the initiative's own saved `color` (see
// InitiativesManager's swatch picker) or derives a stable one from the
// name so two different initiatives don't render identically. The goal
// is purely visual scannability on the Notes page - a wall of same-looking
// cards is what prompted this, not a claim that the guess is "correct".
const KEYWORD_STYLES: { keywords: string[]; icon: LucideIcon; color: string }[] = [
  { keywords: ['fitness', 'gym', 'workout', 'exercise', 'yoga', 'run', 'training'], icon: Dumbbell, color: '#1f9d6b' },
  { keywords: ['medical', 'doctor', 'health', 'therapy', 'clinic'], icon: HeartPulse, color: '#d0443e' },
  { keywords: ['job', 'work', 'career', 'office', 'business', 'startup', 'client'], icon: Briefcase, color: '#3477c9' },
  { keywords: ['finance', 'money', 'budget', 'invest', 'bank', 'tax'], icon: Wallet, color: '#b8951a' },
  { keywords: ['travel', 'trip', 'vacation', 'flight'], icon: Plane, color: '#1f9bb0' },
  { keywords: ['family', 'home', 'house', 'parents'], icon: Home, color: '#c93b8f' },
  { keywords: ['study', 'learn', 'course', 'school', 'university', 'exam', 'gre', 'class'], icon: GraduationCap, color: '#7c5cd8' },
  { keywords: ['food', 'diet', 'nutrition', 'cook', 'recipe'], icon: UtensilsCrossed, color: '#d9731f' },
  { keywords: ['personal'], icon: User, color: '#1f9bb0' },
]

// The deterministic fallback for a name that matches no keyword above.
// Colors are 6-digit hex throughout so callers can safely append two more
// hex digits for a translucent tint (see initiativeBadgeStyle).
const FALLBACK_STYLES: { icon: LucideIcon; color: string }[] = [
  { icon: Rocket, color: '#7c5cd8' },
  { icon: Star, color: '#b8951a' },
  { icon: Compass, color: '#3477c9' },
  { icon: Layers, color: '#d9731f' },
  { icon: Target, color: '#1f9d6b' },
  { icon: Sparkles, color: '#c93b8f' },
  { icon: Flag, color: '#1f9bb0' },
]

// The swatches offered in the picker: eight clearly different hue families
// (green, teal, blue, violet, magenta, red, orange, gold), every automatic
// color above is drawn from this same set so nothing looks off-palette.
export const PICKABLE_INITIATIVE_COLORS = [
  '#1f9d6b', // green
  '#1f9bb0', // teal
  '#3477c9', // blue
  '#7c5cd8', // violet
  '#c93b8f', // magenta
  '#d0443e', // red
  '#d9731f', // orange
  '#b8951a', // gold
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export interface InitiativeStyle {
  Icon: LucideIcon
  color: string
}

/** Null input (no initiative / Uncategorized) intentionally renders with
 * no icon and no color - "uncategorized" should look distinct from every
 * real category, not just be another color in the set. */
export function getInitiativeStyle(initiative: { name: string; color?: string | null } | null | undefined): InitiativeStyle | null {
  if (!initiative) return null
  const lower = initiative.name.toLowerCase()
  const matched = KEYWORD_STYLES.find((s) => s.keywords.some((k) => lower.includes(k)))
  const fallback = FALLBACK_STYLES[hashString(initiative.name) % FALLBACK_STYLES.length]
  return {
    Icon: (matched ?? fallback).icon,
    color: initiative.color || matched?.color || fallback.color,
  }
}

/** A translucent background + solid text/icon color from the same hex,
 * matching the app's existing bg-accent-soft/text-accent pill pattern
 * (frontend/src/styles/index.css) but per-category instead of one fixed
 * accent. `1a` = ~10% alpha, enough to tint without hurting contrast on
 * either theme's card background. */
export function initiativeBadgeStyle(color: string): { backgroundColor: string; color: string } {
  return { backgroundColor: `${color}1a`, color }
}
