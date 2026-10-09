// Service worker: lets the app open like an app and keep working offline.
//
// It is deliberately simple. For files from this site it asks the network first, so an update appears as
// soon as you are online, and it keeps a copy of whatever it got. If the network is not there, it
// answers from the last copy. It never touches other sites, never sees or stores your study data
// (that lives in the page's own storage), and sends nothing anywhere.
const CACHE = 'identity-lab-coach-offline-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('identity-lab-coach-offline') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return; // other sites are none of its business
  event.respondWith((async () => {
    try {
      // Ask the site whether the file changed (the browser's own copy can be up to ten minutes old, which can mix old and new files after an update).
      const response = await fetch(request, { cache: 'no-cache' });
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    } catch (error) {
      const cached = (await caches.match(request))
        ?? (request.mode === 'navigate' ? (await caches.match('index.html')) ?? (await caches.match('./')) : undefined);
      if (!cached) throw error;
      // Say so, so the page can tell you it is using an offline copy.
      const headers = new Headers(cached.headers);
      headers.set('x-served-from-offline-copy', '1');
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
  })());
});
