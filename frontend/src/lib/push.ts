import { api, ApiError } from '../api/client'

// Task reminders (Web Push). The pieces: the service worker (public/push-sw.js) shows the
// notification, the browser's PushManager holds this device's subscription, and the backend
// (api/routers/push.py) stores it and sends at 9 AM and 5 PM in this device's time zone.

export type PushSupport = 'ok' | 'unsupported' | 'ios-needs-install'

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function pushSupport(): PushSupport {
  // iPhones only get push when the app is added to the Home Screen; in Safari the API is absent.
  if (isIos() && !isInstalled()) return 'ios-needs-install'
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  return ok ? 'ok' : 'unsupported'
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function keyToBytes(base64Url: string): Uint8Array {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null
  return (await registration()).pushManager.getSubscription()
}

// Whether the server has push set up at all (it has no VAPID keys until the owner adds them).
export async function serverSupportsPush(): Promise<boolean> {
  try {
    await api.get<{ public_key: string }>('/api/push/key')
    return true
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return false
    return true // a hiccup (network) isn't a "no" - let the person try
  }
}

async function register(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  await api.post('/api/push/subscribe', {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    timezone: deviceTimeZone(),
  })
}

export class PermissionDenied extends Error {}

export async function enableReminders(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PermissionDenied('Notifications are blocked for this app.')
  const { public_key } = await api.get<{ public_key: string }>('/api/push/key')
  const reg = await registration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(public_key) as BufferSource }))
  await register(sub)
}

export async function disableReminders(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  await api.post('/api/push/unsubscribe', { endpoint })
}

export async function sendTestReminder(): Promise<void> {
  await api.post('/api/push/test')
}

// Called when the app opens: if reminders are on, tell the server the device's current time zone
// (it changes when someone travels) and that this subscription is still alive.
export async function syncReminders(): Promise<void> {
  try {
    if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return
    const sub = await currentSubscription()
    if (sub) await register(sub)
  } catch {
    // best effort - reminders keep using the last known time zone
  }
}
