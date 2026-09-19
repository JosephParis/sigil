/* global __SW_PRECACHE__ */
// The service worker (issue 35). Not bundled: the build reads this file,
// fills in the two placeholders, and writes it to dist/sw.js. See swPlugin()
// in vite.config.js.
//
// Update path: a new deploy changes VERSION, so the browser sees a new worker
// the next time it checks sw.js. That worker precaches the new shell into its
// own cache and then WAITS. It takes over only once every tab running the old
// one has closed, i.e. on the next launch. No skipWaiting: swapping the shell
// under a live run would pair old code with a new save format mid-descent.
// activate then deletes every cache but its own.
const VERSION = '__SW_VERSION__'
const PRECACHE = __SW_PRECACHE__
const CACHE = `sigil-shell-${VERSION}`

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // The API is never answered from cache. Returning without respondWith hands
  // the request to the network untouched, so offline it fails the way the
  // network layer already expects (local-only mode).
  if (url.pathname.startsWith('/api/')) return

  // Every route is the same SPA shell, so a navigation gets the cached
  // index.html. It is the shell this worker's version shipped with, which is
  // what keeps the HTML and the hashed bundles it names in step.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(hit => hit || fetch(req)),
    )
    return
  }

  // Precached files are cache-first. Anything else (the audio) is left alone
  // and goes to the network exactly as it would with no worker installed.
  if (!PRECACHE.includes(url.pathname)) return
  event.respondWith(caches.match(url.pathname).then(hit => hit || fetch(req)))
})
