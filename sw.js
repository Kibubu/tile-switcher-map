/* Service worker: makes zooming and panning over places you've already seen instant, and lets the
 * map open on a weak or missing signal.
 *
 * - App shell (HTML, CSS, JS, Leaflet): cached on install. The page itself is fetched from the
 *   network first but falls back to the cached copy after NAV_TIMEOUT_MS; versioned files
 *   (?v=…) and vendor/ are served from the cache.
 * - Map tiles: every tile you have seen is kept and served from the cache; tiles older than
 *   TILE_MAX_AGE_MS are refreshed in the background. Each provider group has its own cache with
 *   its own limit (MAX_TILES, oldest dropped first), so browsing one style doesn't evict another.
 *   Nothing is prefetched: the providers' usage policies forbid bulk downloading.
 *
 * Bump VERSION together with the ?v= query strings in index.html on every deploy.
 */
const VERSION = '5';
const SHELL_CACHE = `tsm-shell-v${VERSION}`;
const TILE_CACHE = 'tsm-tiles-';

const SHELL_FILES = [
  './',
  `style.css?v=${VERSION}`,
  `providers.js?v=${VERSION}`,
  `app.js?v=${VERSION}`,
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
];

// The tile hosts come from providers.js: one cache per provider group, so browsing one style
// doesn't evict another. Hosts of services whose terms restrict storing tiles (TILE_KEYS without
// `cache`) are left alone and only go through the browser's HTTP cache.
importScripts(`providers.js?v=${VERSION}`);

const TILE_HOSTS = [];
for (const p of self.PROVIDERS) {
  const store = !p.key || Boolean(self.TILE_KEYS[p.key].cache);
  const name = p.group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const { url } of p.layers) {
    const host = url.match(/^https:\/\/([^/?]+)/)[1];
    const re = new RegExp(`^${host.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace('{s}', '[^.]+')}$`);
    if (!TILE_HOSTS.some(([r]) => r.source === re.source)) TILE_HOSTS.push([re, name, store]);
  }
}

// Key parameters are left out of the cache key, so a changed key still finds the tiles.
const KEY_PARAMS = Object.values(self.TILE_KEYS).map((k) => k.param);
function tileKey(url) {
  const u = new URL(url);
  if (!KEY_PARAMS.some((param) => u.searchParams.has(param))) return url;
  for (const param of KEY_PARAMS) u.searchParams.delete(param);
  return u.href;
}

const NAV_TIMEOUT_MS = 4000;
const TILE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const MAX_TILES = 2000;          // per provider group, ~20–60 MB; the browser may evict more under pressure
const TRIM_EVERY = 50;           // check the tile count every n stored tiles

const scope = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  // Default cache mode: right after the first visit these come out of the HTTP cache, so
  // installing costs (almost) no extra data on a slow connection.
  event.waitUntil((async () => {
    await (await caches.open(SHELL_CACHE)).addAll(SHELL_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('tsm-shell-') && key !== SHELL_CACHE) await caches.delete(key);
      // Tile caches of groups that no longer exist (or no longer may be stored).
      if (key.startsWith(TILE_CACHE) && !TILE_HOSTS.some(([, name, store]) => store && key === TILE_CACHE + name)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const host = TILE_HOSTS.find(([re]) => re.test(url.hostname));
  if (host) {
    if (host[2]) event.respondWith(tile(event, TILE_CACHE + host[1]));
    return;
  }
  if (url.origin !== scope.origin || !url.href.startsWith(scope.href)) return;

  if (req.mode === 'navigate') { event.respondWith(page(event)); return; }
  event.respondWith(shellAsset(req));
});

/** Resolves with the network response, or with null after ms (the fetch keeps running). */
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function page(event) {
  const req = event.request;
  const key = new URL(req.url);
  key.search = ''; key.hash = '';
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(req).then((res) => {
    // A redirected response can't answer a later navigation, so only plain 200s are kept.
    if (res.ok && !res.redirected) event.waitUntil(cache.put(key.href, res.clone()));
    return res;
  });
  network.catch(() => {});
  const isIndex = key.href === scope.href || key.href === scope.href + 'index.html';
  const cached = (await cache.match(key.href)) || (isIndex ? await cache.match(scope.href) : undefined);
  if (!cached) return network;
  try {
    return (await withTimeout(network, NAV_TIMEOUT_MS)) || cached;
  } catch {
    return cached;
  }
}

async function shellAsset(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(req, res.clone());
  }
  return res;
}

const stored = {};
async function tile(event, cacheName) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  const store = async (res) => {
    // Opaque (no-CORS) responses would count several MB each against the storage quota.
    if (!res.ok || res.type === 'opaque') return;
    await cache.put(key, res);
    stored[cacheName] = (stored[cacheName] || 0) + 1;
    if (stored[cacheName] % TRIM_EVERY === 0) await trimTiles(cache);
  };
  const key = tileKey(req.url);
  const cached = await cache.match(key);
  if (cached) {
    const age = Date.now() - new Date(cached.headers.get('date') || 0).getTime();
    if (age > TILE_MAX_AGE_MS && self.navigator.onLine !== false) {
      event.waitUntil(fetch(req).then(store).catch(() => {}));
    }
    return cached;
  }
  const res = await fetch(req);
  event.waitUntil(store(res.clone()).catch(() => {}));
  return res;
}

async function trimTiles(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]);
}
