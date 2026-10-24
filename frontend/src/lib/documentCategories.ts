import {
  Briefcase,
  Building2,
  Car,
  File,
  GraduationCap,
  HeartPulse,
  Home,
  IdCard,
  Image,
  Landmark,
  Plane,
  Presentation,
  Receipt,
  ReceiptText,
  Shield,
  Signature,
  type LucideIcon,
} from 'lucide-react'
import type { UsageMode } from '../api/types'

// Mirrors documents.CATEGORIES on the backend - keep the two in sync.
export const DOCUMENT_CATEGORIES: { name: string; icon: LucideIcon; color: string; work: boolean }[] = [
  { name: 'Identity', icon: IdCard, color: '#2563eb', work: false },
  { name: 'Photos', icon: Image, color: '#c026d3', work: false },
  { name: 'Finance', icon: Landmark, color: '#0d9488', work: false },
  { name: 'Tax', icon: Receipt, color: '#ca8a04', work: false },
  { name: 'Insurance', icon: Shield, color: '#0891b2', work: false },
  { name: 'Medical', icon: HeartPulse, color: '#e11d48', work: false },
  { name: 'Travel', icon: Plane, color: '#0284c7', work: false },
  { name: 'Education', icon: GraduationCap, color: '#4f46e5', work: false },
  { name: 'Home', icon: Home, color: '#ea580c', work: false },
  { name: 'Vehicle', icon: Car, color: '#64748b', work: false },
  { name: 'Contracts', icon: Signature, color: '#1d4ed8', work: true },
  { name: 'Proposals & Decks', icon: Presentation, color: '#d97706', work: true },
  { name: 'Invoices', icon: ReceiptText, color: '#0d9488', work: true },
  { name: 'HR & Hiring', icon: Briefcase, color: '#db2777', work: true },
  { name: 'Company & Legal', icon: Building2, color: '#57534e', work: true },
  { name: 'Other', icon: File, color: '#8a857b', work: false },
]

export function categoryStyle(name: string) {
  return DOCUMENT_CATEGORIES.find((c) => c.name === name) ?? DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1]
}

// Work categories lead in Work mode, personal ones in Personal mode -
// every category stays available in every mode.
export function orderedCategories(mode: UsageMode) {
  if (mode === 'both') return DOCUMENT_CATEGORIES
  const lead = DOCUMENT_CATEGORIES.filter((c) => c.work === (mode === 'work') && c.name !== 'Other')
  const rest = DOCUMENT_CATEGORIES.filter((c) => !lead.includes(c))
  return [...lead, ...rest]
}

export function fileKind(mime: string, fileName: string): string {
  if (mime.startsWith('image/')) return 'IMG'
  if (mime === 'application/pdf') return 'PDF'
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toUpperCase() : ''
  return ext.slice(0, 4) || 'FILE'
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Days until expiry (negative = already expired), or null. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000)
}

export const EXPIRING_SOON_DAYS = 60
