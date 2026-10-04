import type { ReactNode } from 'react'

// A short, persistent one-line explainer under a page's <h1> - every tab
// gets one of these (not just Chat/Notes, which previously had ad-hoc
// empty-state copy no other tab carried), so what a screen does is
// visible every time you land on it, not only once via the onboarding
// Tour or only when a list happens to be empty.
export default function PageIntro({ children }: { children: ReactNode }) {
  return <p className="mb-4 max-w-2xl text-sm text-text-muted">{children}</p>
}
