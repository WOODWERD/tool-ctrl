// Offline copy of the app. Online always gets the newest files; the saved copy is only the fallback.
// All WOODWERD tools share one web address, so this clears only Tool Ctrl's own old copies.
const VERSION = 'tool-ctrl-x0.0.3';
const FILES = ['./', 'index.html', 'tokens.css', 'styles.css', 'chrome.js', 'core.js', 'catalog.js', 'store.js', 'github.js', 'sync.js', 'reader.js', 'app.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'fonts/Inter-Regular.woff2', 'fonts/Inter-Medium.woff2', 'fonts/Inter-SemiBold.woff2',
  'fonts/Inter-Bold.woff2', 'fonts/jetbrains-mono-latin-400-normal.woff2', 'fonts/jetbrains-mono-latin-500-normal.woff2'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('tool-ctrl-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
