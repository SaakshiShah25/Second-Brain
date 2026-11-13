import { useSyncExternalStore } from 'react'

// Installing the app. Chrome (Android and desktop) offers a one-tap install through the `beforeinstallprompt` event,
// but fires it only once, early, and only when it decides the app qualifies - so it is caught here as the page loads
// and kept, for the Settings button to use later. When the browser never offers it (Chrome already decided, or it
// is iPhone / Safari, which has no such event), Settings shows the exact steps for that browser instead.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
let installed = typeof window !== 'undefined' && isStandalone()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for the Settings button instead of Chrome's own mini-bar
    deferred = e as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    emit()
  })
}

export type Platform = 'ios' | 'android' | 'desktop'
export function platform(): Platform {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  return /android/i.test(ua) ? 'android' : 'desktop'
}

const snapshot = () => `${installed}|${deferred ? 1 : 0}`

export function useInstall() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    snapshot,
  )
  return {
    installed,
    // True when Chrome has handed over its install prompt: one tap installs.
    canPrompt: !!deferred,
    async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
      if (!deferred) return 'unavailable'
      const ev = deferred
      deferred = null // a prompt can be used once
      emit()
      await ev.prompt()
      const { outcome } = await ev.userChoice
      return outcome
    },
  }
}
