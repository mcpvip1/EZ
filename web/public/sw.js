// EASY 2D service worker: app-shell cache only. IndexedDB data is never
// cached here and is never touched by a code update — code and data stay
// separate (same pattern as DO2-Hti).
// All shell URLs are relative to the service worker's own scope, so the
// app also works when hosted under a subpath (Space, GitHub Pages).
// If registration fails (e.g. inside a framed Space) the app still loads:
// main.tsx registers with .catch(() => undefined).
const CACHE = 'easy2d-v3';
const BASE = self.registration.scope;
const SHELL = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`, `${BASE}icon.svg`];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // Network-first: a code update must reach the device on the next load.
  // (The old cache-first handler could pin a stale shell forever.) The
  // cache is only the offline fallback.
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match(`${BASE}index.html`)))
  );
});
