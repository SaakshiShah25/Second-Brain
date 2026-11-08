// Loaded into the app's service worker (vite.config.ts > workbox.importScripts).
// Shows the task reminder when the server pushes one, and opens the Tasks tab when it is tapped.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MyConfía', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'tasks',
      renotify: true, // a newer reminder with the same tag replaces the old one and alerts again
      silent: false, // make a sound whenever the phone's own notification settings allow it
      vibrate: [200, 100, 200, 100, 200], // and buzz (Android; iPhones ignore it and follow their own settings)
      timestamp: Date.now(),
      data: { url: data.url || '/today' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/today'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reuse the open app window if there is one, otherwise open a new one.
      for (const win of windows) {
        if ('focus' in win) {
          if ('navigate' in win) win.navigate(url).catch(() => {})
          return win.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
