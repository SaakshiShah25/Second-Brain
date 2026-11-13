// Loaded into the app's service worker (vite.config.ts > workbox.importScripts).
// Shows the task reminder when the server pushes one, and opens the right screen when it is tapped.
//
// An "alarm" reminder (the user turned on Alarm-style reminders) is louder: if the app is open and in view, it is handed
// straight to the app, which shows a full-screen card with sound and vibration. If the app is closed or in the
// background, a notification that stays on screen until tapped (requireInteraction) with a long buzz is shown, and tapping it
// opens the same card. A web app cannot ring over the lock screen or play its own sound while closed - that is the
// operating system's job, and only a native app can take it over.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const ids = Array.isArray(data.task_ids) ? data.task_ids : []
  const alarmUrl = '/today?alarm=' + (data.test && ids.length === 0 ? 'test' : ids.join(',') || 'test')

  event.waitUntil(
    (async () => {
      if (data.alarm) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        // Every open window of the app is told, so the alarm card is already there (and ringing) when the person
        // comes back to a tab or app that was in the background.
        for (const w of windows) w.postMessage({ type: 'confia-alarm', ids, title: data.title || '', body: data.body || '', test: !!data.test })
        // With the app in front of the person the card is enough; otherwise a notification is needed too (a closed
        // app cannot be opened by a push - only by a tap on this notification).
        if (windows.some((w) => w.visibilityState === 'visible')) return
      }
      await self.registration.showNotification((data.alarm ? '⏰ ' : '') + (data.title || 'MyConfía'), {
        body: data.alarm ? 'Tap to open the alarm' + (data.body ? ' · ' + data.body : '') : data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag || 'tasks',
        renotify: true, // a newer reminder with the same tag replaces the old one and alerts again
        silent: false, // make a sound whenever the phone's own notification settings allow it
        requireInteraction: !!data.alarm, // an alarm stays on screen until it is tapped or dismissed
        vibrate: data.alarm ? [600, 200, 600, 200, 600, 200, 600, 200, 600] : [200, 100, 200, 100, 200], // buzz (Android; iPhones follow their own settings)
        timestamp: Date.now(),
        data: { url: data.alarm ? alarmUrl : data.url || '/today' },
      })
    })(),
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
