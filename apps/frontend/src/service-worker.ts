/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

// Minimal SW: makes the app installable and caches the immutable app shell.
// Game data is real-time only, so API / WebSocket requests are never cached.
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `manhunt-${version}`;
const ASSETS = [...build, ...files.filter((f) => !f.endsWith('.mp3'))];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => sw.skipWaiting()));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin || url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return;

  // Hashed build assets never change: cache first.
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
    return;
  }

  // Navigations: network first, bypassing the HTTP cache so a refresh always gets
  // the latest index.html (and thus the latest hashed bundles).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(async () => (await caches.match('/')) ?? (await caches.match('/index.html')) ?? Response.error()),
    );
  }
});
