import { Briefcase, Home, Sparkles, type LucideIcon } from 'lucide-react'
import { useSettings } from '../api/settings'
import type { UsageMode } from '../api/types'

// What the account is used for - Work, Personal or Both (Settings >
// "Using MyConfía for", first asked in UsageModeSheet). It only changes
// which features and wording the app LEADS with; it never hides or
// alters stored data (a contact's saved company still shows in Personal
// mode, for instance).

export const USAGE_MODE_OPTIONS: { value: UsageMode; label: string; icon: LucideIcon; description: string }[] = [
  { value: 'work', label: 'Work', icon: Briefcase, description: 'Clients, colleagues, meetings and deals.' },
  { value: 'personal', label: 'Personal', icon: Home, description: 'Friends, family, health and life admin.' },
  { value: 'both', label: 'Both', icon: Sparkles, description: 'One place for work and life.' },
]

// Starter categories (initiatives) offered alongside the choice - the
// first few of each list come pre-selected.
export const SUGGESTED_INITIATIVES: Record<UsageMode, { names: string[]; preselected: number }> = {
  work: { names: ['Work', 'Clients', 'Projects', 'Hiring', 'Networking', 'Finance'], preselected: 3 },
  personal: { names: ['Personal', 'Family', 'Friends', 'Health', 'Home', 'Finance', 'Travel'], preselected: 4 },
  both: { names: ['Work', 'Personal', 'Clients', 'Family', 'Health', 'Projects', 'Finance'], preselected: 4 },
}

export function useUsageMode() {
  const { data: settings } = useSettings()
  const raw = settings?.usage_mode
  return {
    // Unknown / not chosen yet behaves as "both" - nothing gets hidden.
    mode: (raw ?? 'both') as UsageMode,
    // false until the backend has the column (schema.sql section 25) -
    // the Settings row and onboarding question stay hidden until then.
    available: settings !== undefined && raw !== undefined,
    // Strictly null = the column exists and this account hasn't answered.
    needsChoice: settings !== undefined && raw === null,
    isWork: (raw ?? 'both') !== 'personal',
    isPersonal: (raw ?? 'both') !== 'work',
  }
}
