// Service worker — exists solely to receive Web Push notifications. It
// deliberately does NOT cache anything or intercept fetches: the app is not
// offline-capable by design (see CLAUDE.md), and a caching SW would silently
// serve stale pages after a deploy.

// Take over immediately instead of waiting for every existing tab to close,
// so enabling notifications works on the first try rather than the next visit.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  // A push with no/invalid payload must still show something — a silent push
  // makes some browsers revoke the permission.
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'رفيق CRM'
  const options = {
    body: payload.body || 'لديك إشعار جديد',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    // Collapses repeat notifications about the same lead into one entry
    // instead of stacking them up.
    tag: payload.tag || undefined,
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  // Focus an already-open tab of this app and navigate it, rather than piling
  // up new windows every time a notification is tapped.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})
