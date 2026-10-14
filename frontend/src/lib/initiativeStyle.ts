import {
  BookOpen,
  Briefcase,
  Building2,
  Camera,
  Code,
  Coffee,
  Compass,
  Dumbbell,
  Flag,
  Globe,
  GraduationCap,
  HeartPulse,
  Home,
  Layers,
  Lightbulb,
  Music,
  Palette,
  Plane,
  Rocket,
  ShoppingCart,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  User,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

// Every initiative is a free-text name the user typed ("Fitness", "Job",
// "Tenaxis AI"), so there's no fixed category enum to switch on. An
// initiative's look comes from, in order:
//   1. an icon the user CHOSE (saved as a key like "rocket" - see ICONS);
//   2. otherwise a GUESS from the words in its name (KEYWORD_STYLES);
//   3. otherwise a stable pick from FALLBACK_STYLES, derived from the name.
// New initiatives get a guess that no other initiative is already using saved
// for them (suggestIconKey), so two of a user's categories don't end up looking
// identical. The color works the same way: the saved one, else the guess.

/** The icons an initiative can use. The KEY is what's stored, so keep keys
 * stable; add new ones freely. */
export const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  rocket: Rocket,
  dumbbell: Dumbbell,
  heart: HeartPulse,
  wallet: Wallet,
  plane: Plane,
  home: Home,
  graduation: GraduationCap,
  food: UtensilsCrossed,
  user: User,
  star: Star,
  compass: Compass,
  layers: Layers,
  target: Target,
  sparkles: Sparkles,
  flag: Flag,
  lightbulb: Lightbulb,
  code: Code,
  book: BookOpen,
  users: Users,
  camera: Camera,
  music: Music,
  cart: ShoppingCart,
  palette: Palette,
  building: Building2,
  trending: TrendingUp,
  coffee: Coffee,
  globe: Globe,
}
const ICON_KEYS = Object.keys(ICONS)
// When an initiative's natural icon is already used by another, it gets one of
// these instead - neutral shapes first, so a clash never hands out a
// meaningful icon (a dumbbell, a plane) to something unrelated.
const NEUTRAL_ICON_ORDER = [
  'star', 'compass', 'target', 'layers', 'sparkles', 'flag', 'lightbulb', 'globe', 'trending', 'building',
  'palette', 'users', 'book', 'code', 'camera', 'music', 'coffee', 'cart',
]

const KEYWORD_STYLES: { keywords: string[]; icon: string; color: string }[] = [
  { keywords: ['fitness', 'gym', 'workout', 'exercise', 'yoga', 'run', 'running', 'runner', 'cycling', 'training'], icon: 'dumbbell', color: '#1f9d6b' },
  { keywords: ['medical', 'doctor', 'health', 'therapy', 'clinic'], icon: 'heart', color: '#c94f6d' },
  // "startup" used to be in the Job list below, so a Startup category got the
  // same briefcase as Job. It has its own now.
  { keywords: ['startup', 'founder', 'venture', 'launch', 'saas'], icon: 'rocket', color: '#8659c9' },
  { keywords: ['job', 'jobs', 'work', 'working', 'career', 'office', 'business', 'client'], icon: 'briefcase', color: '#3477c9' },
  { keywords: ['finance', 'money', 'budget', 'invest', 'bank', 'tax'], icon: 'wallet', color: '#c98a1d' },
  { keywords: ['travel', 'trip', 'vacation', 'flight'], icon: 'plane', color: '#1f9bb0' },
  { keywords: ['study', 'learn', 'course', 'school', 'university', 'exam', 'gre', 'class', 'homework'], icon: 'graduation', color: '#5b5fc7' },
  { keywords: ['family', 'home', 'house', 'parents'], icon: 'home', color: '#c9577e' },
  { keywords: ['food', 'diet', 'nutrition', 'cook', 'recipe'], icon: 'food', color: '#c9691f' },
  { keywords: ['personal'], icon: 'user', color: '#7c5cd8' },
]

// Used both as the deterministic fallback for a name that matches no
// keyword above, and as the swatch choices in InitiativesManager's color
// picker - kept to 6-digit hex throughout so callers can safely append
// two more hex digits for a translucent tint (see initiativeBadgeStyle).
const FALLBACK_STYLES: { icon: string; color: string }[] = [
  { icon: 'rocket', color: '#8659c9' },
  { icon: 'star', color: '#b8951a' },
  { icon: 'compass', color: '#1d8fc9' },
  { icon: 'layers', color: '#c9573b' },
  { icon: 'target', color: '#2fa876' },
  { icon: 'sparkles', color: '#c93b8f' },
  { icon: 'flag', color: '#c9713b' },
]

export const PICKABLE_INITIATIVE_COLORS = [
  ...KEYWORD_STYLES.map((s) => s.color),
  ...FALLBACK_STYLES.map((s) => s.color),
].filter((c, i, all) => all.indexOf(c) === i)

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Matches on WORDS, not substrings: "run" must not light up "Brunch", nor
// "work" "Network". A keyword of 4+ letters also matches a word that starts
// with it ("startups", "working", "banking"); the 3-letter ones (job, run, gre,
// tax, gym) must match exactly, so "green" isn't a GRE exam.
function matchesKeyword(word: string, keyword: string): boolean {
  return word === keyword || (keyword.length >= 4 && word.startsWith(keyword))
}

function guessFromName(name: string) {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  return KEYWORD_STYLES.find((s) => s.keywords.some((k) => words.some((w) => matchesKeyword(w, k))))
}

export interface InitiativeStyle {
  Icon: LucideIcon
  color: string
  iconKey: string
}

type InitiativeLike = { name: string; color?: string | null; icon?: string | null }

/** Null input (no initiative / Uncategorized) intentionally renders with
 * no icon and no color - "uncategorized" should look distinct from every
 * real category, not just be another color in the set. */
export function getInitiativeStyle(initiative: InitiativeLike | null | undefined): InitiativeStyle | null {
  if (!initiative) return null
  const matched = guessFromName(initiative.name)
  const fallback = FALLBACK_STYLES[hashString(initiative.name) % FALLBACK_STYLES.length]
  const chosen = initiative.icon && ICONS[initiative.icon] ? initiative.icon : null
  const iconKey = chosen ?? matched?.icon ?? fallback.icon
  return {
    Icon: ICONS[iconKey],
    iconKey,
    color: initiative.color || matched?.color || fallback.color,
  }
}

/** The icon to save for a NEW initiative: what its name suggests, unless one
 * of the user's other initiatives already shows that icon - then the first
 * icon nobody is using. This is what stops "Startup" and "Job" (or any two
 * categories) from ending up identical. */
export function suggestIconKey(name: string, existing: InitiativeLike[]): string {
  const taken = new Set(existing.map((i) => getInitiativeStyle(i)?.iconKey))
  const suggested = getInitiativeStyle({ name })!.iconKey
  if (!taken.has(suggested)) return suggested
  return [...NEUTRAL_ICON_ORDER, ...ICON_KEYS].find((k) => !taken.has(k)) ?? suggested
}

/** The colour to save for a NEW initiative, chosen the same way as its icon:
 * what its name suggests, unless another of the user's initiatives already
 * shows that colour - then the first colour nobody is using. */
export function suggestColor(name: string, existing: InitiativeLike[]): string {
  const taken = new Set(existing.map((i) => getInitiativeStyle(i)?.color.toLowerCase()))
  const suggested = getInitiativeStyle({ name })!.color
  if (!taken.has(suggested.toLowerCase())) return suggested
  return PICKABLE_INITIATIVE_COLORS.find((c) => !taken.has(c.toLowerCase())) ?? suggested
}

/** A translucent background + solid text/icon color from the same hex,
 * matching the app's existing bg-accent-soft/text-accent pill pattern
 * (frontend/src/styles/index.css) but per-category instead of one fixed
 * accent. `1a` = ~10% alpha, enough to tint without hurting contrast on
 * either theme's card background. */
export function initiativeBadgeStyle(color: string): { backgroundColor: string; color: string } {
  return { backgroundColor: `${color}1a`, color }
}
