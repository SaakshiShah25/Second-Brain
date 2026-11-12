import { recentErrorCode } from './errorDialog'

// What is sent along with feedback so it can be understood - never any note text (that is opt-in, per report).
export function feedbackContext(): Record<string, string | undefined> {
  const installed = window.matchMedia?.('(display-mode: standalone)').matches
  return { app_version: installed ? 'installed app' : 'browser', error_id: recentErrorCode() }
}

// Where in the app the person is, as a short word.
export function screenName(pathname: string): string {
  if (pathname === '/') return 'home'
  return pathname.split('/')[1] || 'home'
}
