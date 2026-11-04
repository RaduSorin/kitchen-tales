// Added to the app's service worker (vite.config.ts, workbox.importScripts):
// shows the cooking-timer notification and opens the app when it is tapped.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* not JSON */ }
  event.waitUntil(self.registration.showNotification(data.title || 'Bucătăria cu povești', {
    body: data.body || '',
    tag: data.tag,
    renotify: true,
    requireInteraction: true,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => 'focus' in c)
    if (open) return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : c)).catch(() => open.focus())
    return self.clients.openWindow(url)
  }))
})
