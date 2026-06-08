const CACHE = 'vegvisir-v2'
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  // Navigations (inkl. Share-Target ?url=…) → immer die App-Shell ausliefern.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)))
    return
  }

  // Favicons o.ä. (extern) → Netz zuerst, sonst durchreichen.
  const url = new URL(req.url)
  if (url.origin !== location.origin) return

  // Eigene Assets: Cache-first.
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
      return res
    })),
  )
})
