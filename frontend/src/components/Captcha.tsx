import { useEffect, useRef } from 'react'

// Cloudflare Turnstile - the bot check for sign-up / sign-in / password
// reset. Off by default: it renders only when VITE_TURNSTILE_SITE_KEY is
// set, so local development and any deployment that hasn't set it up behave
// exactly as before. To turn it on, create a Turnstile widget in Cloudflare,
// put its SITE key in VITE_TURNSTILE_SITE_KEY (Vercel) and its SECRET key
// in Supabase -> Authentication -> Attack Protection -> CAPTCHA. Supabase
// then rejects any auth request that arrives without a valid token, which
// is what stops a script from skipping this widget.

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = SCRIPT_SRC
      el.async = true
      el.onload = () => resolve()
      el.onerror = () => {
        scriptPromise = null
        reject(new Error('Could not load the verification check.'))
      }
      document.head.appendChild(el)
    })
  }
  return scriptPromise
}

interface CaptchaProps {
  onToken: (token: string | null) => void
  // Bump this after each submit - a Turnstile token works once, so the
  // widget has to produce a fresh one for the next attempt.
  resetKey?: number
}

export default function Captcha({ onToken, resetKey = 0 }: CaptchaProps) {
  const holder = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | undefined>(undefined)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !holder.current) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !holder.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(holder.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = undefined
    }
  }, [])

  useEffect(() => {
    if (resetKey > 0 && widgetId.current && window.turnstile) {
      onTokenRef.current(null)
      window.turnstile.reset(widgetId.current)
    }
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={holder} className="flex min-h-[65px] justify-center" />
}
