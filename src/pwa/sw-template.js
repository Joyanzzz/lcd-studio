/* Service worker de LCD Studio. Lo genera vite.config.ts en cada compilación con
 * el nombre de caché y la lista de recursos. No hace peticiones a terceros. */

const CACHE_NAME = '__CACHE_NAME__';
const ASSETS = __ASSETS__;
const PREFIX = 'lcd-studio-';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Navegación: red primero (así una versión rota nunca queda fija), caché sin conexión. */
async function navigate(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(request, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (response.ok) return response;
    throw new Error(String(response.status));
  } catch {
    return (
      (await cache.match('./', { ignoreVary: true })) ||
      (await cache.match('./index.html', { ignoreVary: true })) ||
      Response.error()
    );
  }
}

/** Recursos con hash en el nombre: caché primero. */
async function asset(request) {
  // Los scripts de módulo llevan cabecera Origin; el servidor puede responder con Vary: Origin.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  event.respondWith(asset(request));
});
