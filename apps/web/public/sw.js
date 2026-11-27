const VERSION = "v8";
const CACHE_APP = `sed-app-${VERSION}`;
const CACHE_MAP = `sed-map-${VERSION}`;
const CACHE_DATA = `sed-data-${VERSION}`;

const TILES_PATH = "/map/pasto.pmtiles";

const API_ORIGIN = (() => {
  try {
    const api = new URL(self.location.href).searchParams.get("api");
    const url = api ? new URL(api) : null;
    return url && (url.protocol === "https:" || url.protocol === "http:") ? url.origin : null;
  } catch {
    return null;
  }
})();

const API_PATHS_WITH_FALLBACK = new Set(["/api/state", "/api/schedule", "/api/businesses"]);

const API_PRECACHE = ["/api/schedule", "/api/businesses"];
const NOTIFICATION_ICON = "/icon-192.png";

const PRECACHE = [
  "/",
  "/today",
  "/parades",
  "/photos",
  "/icon.svg",
  "/icon-192.png",
  "/map/maplibre-worker.mjs",
  "/manifest.webmanifest",
  "/fonts/alfa-slab-one-latin.woff2",
];

const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.allSettled([
      caches
        .open(CACHE_APP)
        .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))),
      caches.open(CACHE_MAP).then((c) => c.add(TILES_PATH)),
      API_ORIGIN
        ? caches
            .open(CACHE_DATA)
            .then((c) => Promise.allSettled(API_PRECACHE.map((path) => c.add(new URL(path, API_ORIGIN).href))))
        : null,
    ]).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("sed-") && !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function networkFirstWithFallback(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const saved = await cache.match(req);
    if (saved) {
      const headers = new Headers(saved.headers);
      headers.set("X-From-Cache", "1");
      return new Response(saved.body, {
        status: saved.status,
        statusText: saved.statusText,
        headers: headers,
      });
    }
    throw new Error("no network and no cache");
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res && res.ok) await cache.put(req, res.clone());
  return res;
}

let tilesBuffer = null;

let bufferPath = null;

async function tilesFile(path) {
  if (tilesBuffer && bufferPath === path) return tilesBuffer;
  const cache = await caches.open(CACHE_MAP);
  let res = await cache.match(path);
  if (!res) {
    const network = await fetch(path);
    if (!network.ok || network.status !== 200) return null;
    await cache.put(path, network.clone());
    res = network;
  }
  tilesBuffer = await res.arrayBuffer();
  bufferPath = path;
  return tilesBuffer;
}

async function serveTiles(req) {
  let buffer = null;
  try {
    buffer = await tilesFile(new URL(req.url).pathname);
  } catch {
  }
  if (!buffer) return fetch(req);

  const total = buffer.byteLength;
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get("range") || "");
  if (!range) {
    return new Response(buffer, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(total) },
    });
  }
  const start = Number(range[1]);
  const end = Math.min(range[2] ? Number(range[2]) : total - 1, total - 1);
  if (start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }
  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (API_ORIGIN && url.origin === API_ORIGIN) {
    if (API_PATHS_WITH_FALLBACK.has(url.pathname)) {
      event.respondWith(networkFirstWithFallback(req, CACHE_DATA).catch(() => Response.error()));
    }
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith(".pmtiles")) {
    event.respondWith(serveTiles(req).catch(() => Response.error()));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      networkFirstWithFallback(req, CACHE_APP).catch(async () => {
        const c = await caches.open(CACHE_APP);
        return (await c.match("/")) ?? Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/map/fonts/") ||
    url.pathname === "/map/maplibre-worker.mjs") {
    event.respondWith(cacheFirst(req, CACHE_APP).catch(() => Response.error()));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Sigue el Desfile", {
      body: data.body || "El desfile se está acercando a donde estás.",
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: "parade-near",
      vibrate: [200, 100, 200],
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const v of windows) if ("focus" in v) return v.focus();
      return self.clients.openWindow(target);
    }),
  );
});
