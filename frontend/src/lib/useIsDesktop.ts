import { useSyncExternalStore } from 'react'

// The one line between the two layouts (Tailwind's `lg`): from 1024px up the app is laid out for a laptop or desktop
// browser. Classes handle most of it; this is for the places where the two show different things.
const QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export const isDesktopNow = () => window.matchMedia(QUERY).matches

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktopNow, () => false)
}
