// SANGA service worker.
//
// This file is the minimum needed for Chrome/Edge/Brave/Android to consider
// the app installable: it has install/activate/fetch handlers and is served
// from the same origin as the manifest.
//
// Strategy:
//   - Static assets (icons, manifest, /icons/*, /_next/static/*) -> cache-first.
//   - HTML navigations -> network-first, falling back to /offline when the
//     network is gone. This avoids serving stale dashboard pages from cache,
//     which would be confusing (and worse: misleading) on a finance app.
//   - API calls (/api/*) -> never cached, always passed through to the
//     network. Caching authenticated balance/transaction responses would be
//     a privacy and correctness disaster.
//   - Non-GET requests, non-http(s) schemes, and cross-origin requests are
//     passed straight through.
//
// Bump CACHE_VERSION to force-evict old caches on the next activation.

const CACHE_VERSION = 'v1'
const STATIC_CACHE = `sanga-static-${CACHE_VERSION}`
const RUNTIME_CACHE = `sanga-runtime-${CACHE_VERSION}`

const PRECACHE_URLS = [
  '/manifest.json',
  '/offline',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // addAll fails atomically — if any single URL 404s the precache
        // is rejected and the SW never activates. Use Promise.all on
        // individual adds so a missing icon doesn't kill installation.
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[sw] precache miss', url, err)
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// Allow the page to ask the SW to activate a new version immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    /\.(?:js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|svg|gif|webp|ico)$/i.test(
      url.pathname
    )
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request

  if (req.method !== 'GET') return

  const url = new URL(req.url)

  if (url.origin !== self.location.origin) return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // API calls: always network. Never cache authenticated responses.
  if (url.pathname.startsWith('/api/')) return

  // HTML navigations: network-first, fall back to offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          // Cache successful navigations into runtime so a flaky network
          // doesn't blank the screen on the next click.
          if (response.ok) {
            const clone = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, clone))
          }
          return response
        })
        .catch(() =>
          caches
            .match(req)
            .then((cached) => cached || caches.match('/offline'))
        )
    )
    return
  }

  // Static assets: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone))
          }
          return response
        })
      })
    )
    return
  }
})
