import { useSyncExternalStore } from 'react'

// Whether the browser thinks it has a network connection, live. It only
// knows about "no connection at all" (airplane mode, wifi off) - a weak
// signal that never quite connects still reads as online, which is what the
// request timeouts in api/client.ts are for.
function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
}
