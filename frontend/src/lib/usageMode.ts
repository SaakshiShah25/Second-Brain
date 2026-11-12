import type { UsageMode } from '../api/types'

// "Using MyConfía for" (Work / Personal / Both) is switched off for now: nobody is asked, Settings has no row for it, and
// the app always uses the "Both" wording. The saved value (settings.usage_mode) is left alone in the database, so the
// feature can come back without losing anyone's choice - see git history for the old UsageModeSheet and Settings row.
export function useUsageMode() {
  return {
    mode: 'both' as UsageMode,
    available: false,
    needsChoice: false,
    isWork: true,
    isPersonal: true,
  }
}
