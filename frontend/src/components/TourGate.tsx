import { createContext, useContext, useState, type ReactNode } from 'react'
import { useCompleteTour, useSettings } from '../api/settings'
import Tour from './Tour'

// Auto-shows the onboarding tour once, for any account that hasn't seen
// or skipped it yet (settings.tour_completed_at is null - same server-
// side "seen it" flag pattern as TermsGate's terms_accepted_at, and for
// the same reason: this app is used from both the web app and the
// Android TWA on one account, so a localStorage flag wouldn't follow the
// user across them). Unlike TermsGate, this never blocks the app - it's
// a dismissible walkthrough layered on top of the already-rendered
// Layout, not a consent screen.
//
// Also exposes startTour() via context so Settings can offer a "take the
// tour again" entry point independent of the server flag.

const TourContext = createContext<{ startTour: () => void } | null>(null)

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourGate')
  return ctx
}

export default function TourGate({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings()
  const completeTour = useCompleteTour()
  const [manualOpen, setManualOpen] = useState(false)

  const showTour = manualOpen || (!!settings && !settings.tour_completed_at)

  function handleDone() {
    setManualOpen(false)
    // Only write the flag the first time - re-triggering from Settings
    // shouldn't need a fresh round-trip once it's already set.
    if (!settings?.tour_completed_at) {
      completeTour.mutate()
    }
  }

  return (
    <TourContext.Provider value={{ startTour: () => setManualOpen(true) }}>
      {children}
      {showTour && <Tour onDone={handleDone} />}
    </TourContext.Provider>
  )
}
