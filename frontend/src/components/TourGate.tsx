import { createContext, useContext, useState, type ReactNode } from 'react'
import { useCompleteTour, useSettings } from '../api/settings'
import Tour from './Tour'
import WelcomePrompt from './WelcomePrompt'

// Auto-shows the onboarding tour once, for any account that hasn't seen
// or skipped it yet (settings.tour_completed_at is null - same server-
// side "seen it" flag pattern as TermsGate's terms_accepted_at, and for
// the same reason: this app is used from both the web app and the
// Android TWA on one account, so a localStorage flag wouldn't follow the
// user across them). Unlike TermsGate, this never blocks the app - it's
// a dismissible walkthrough layered on top of the already-rendered
// Layout, not a consent screen.
//
// A brand-new user sees a prominent WelcomePrompt FIRST, not the step
// tour directly - landing straight on Chat with only a small corner card
// as the only sign a tour exists is easy to miss entirely. Once they
// choose "Start Tour" there, the step-by-step Tour takes over (and stays
// the smaller, non-blocking corner card it's always been, since by then
// the user has explicitly opted in). Re-triggering from Settings
// ("take the tour again") skips the welcome prompt and goes straight
// into the step tour - they already know what they're asking for.
//
// Also exposes startTour() via context so Settings can offer that entry
// point independent of the server flag.

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
  const [welcomeAccepted, setWelcomeAccepted] = useState(false)

  const isFirstTime = !!settings && !settings.tour_completed_at
  const showWelcome = isFirstTime && !welcomeAccepted && !manualOpen
  const showTour = manualOpen || (isFirstTime && welcomeAccepted)

  function handleDone() {
    setManualOpen(false)
    setWelcomeAccepted(false)
    // Only write the flag the first time - re-triggering from Settings
    // shouldn't need a fresh round-trip once it's already set.
    if (!settings?.tour_completed_at) {
      completeTour.mutate()
    }
  }

  return (
    <TourContext.Provider value={{ startTour: () => setManualOpen(true) }}>
      {children}
      {showWelcome && <WelcomePrompt onStart={() => setWelcomeAccepted(true)} onSkip={handleDone} />}
      {showTour && <Tour onDone={handleDone} />}
    </TourContext.Provider>
  )
}
