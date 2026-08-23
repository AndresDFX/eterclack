/* EterClack — service worker
 *
 * Estrategia deliberadamente conservadora: esta app maneja reservas, contratos
 * y dinero. Servir datos viejos como si fueran actuales es peor que no servir
 * nada, así que la API NUNCA se cachea.
 *
 *  · Navegaciones → red primero, con la App Shell como respaldo sin conexión.
 *  · Estáticos con hash → cache primero (son inmutables por construcción).
 *  · Imágenes de MinIO → stale-while-revalidate, con techo de entradas.
 *  · API → siempre red. Sin excepciones.
 */

const VERSION = 'v1';
const SHELL = `eterclack-shell-${VERSION}`;
const ASSETS = `eterclack-assets-${VERSION}`;
const IMAGES = `eterclack-images-${VERSION}`;
const MAX_IMAGES = 120;

const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('eterclack-') && !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Recorta la caché de imágenes por antigüedad de inserción (FIFO). */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // La API queda fuera de la caché: nunca datos viejos en reservas ni pagos.
  if (url.port === '3000' || url.pathname.startsWith('/api/')) return;

  // Navegaciones: red primero; sin conexión, la App Shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL);
        return (await cache.match('/')) ?? Response.error();
      }),
    );
    return;
  }

  // Estáticos con hash de Vite: inmutables.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Fotografías servidas por MinIO: se muestran ya y se refrescan detrás.
  if (url.port === '9000' || /\.(png|jpe?g|webp|avif|svg)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(IMAGES).then(async (cache) => {
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              cache.put(request, res.clone());
              trim(IMAGES, MAX_IMAGES);
            }
            return res;
          })
          .catch(() => hit ?? Response.error());
        return hit ?? network;
      }),
    );
  }
});
