/*
 * Service worker de "Sigue el Desfile".
 *
 * Premisa: el 31 de diciembre la celda va a estar saturada. La app tiene que
 * ABRIR igual, aunque los datos lleguen tarde o no lleguen.
 *
 * Estrategia por tipo de recurso:
 *   - armazón y estáticos  -> cache primero (la app abre sin red)
 *   - tiles del mapa       -> cache primero, con tope de entradas
 *   - /api/estado          -> red primero con timeout corto, y si falla,
 *                             se devuelve la última respuesta cacheada.
 *                             Es preferible un dato viejo con su hora que un error.
 *   - /api/posiciones      -> nunca se cachea (es escritura)
 */

const VERSION = "v2";
const CACHE_APP = `sed-app-${VERSION}`;
const CACHE_TILES = `sed-tiles-${VERSION}`;
const CACHE_DATOS = `sed-datos-${VERSION}`;

const PRECARGA = [
  "/",
  "/hoy",
  "/desfiles",
  "/fotos",
  "/api/senda",
  "/icono.svg",
  "/manifest.webmanifest",
  // La tipografía de display va cacheada: sin ella el titular del ETA cae a
  // la serif del sistema, que descuadra la hoja entera.
  "/fuentes/alfa-slab-one-latin.woff2",
];

const MAX_TILES = 600;
const TIMEOUT_RED_MS = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE_APP)
      // addAll falla entero si un recurso falla; se agregan uno a uno.
      .then((c) => Promise.allSettled(PRECARGA.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((k) => k.startsWith("sed-") && !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function podarCache(nombre, maximo) {
  const cache = await caches.open(nombre);
  const claves = await cache.keys();
  if (claves.length <= maximo) return;
  // FIFO simple: se botan las más viejas.
  await Promise.all(claves.slice(0, claves.length - maximo).map((k) => cache.delete(k)));
}

function conTimeout(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promesa.then(
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

async function redPrimeroConRespaldo(req, nombreCache) {
  const cache = await caches.open(nombreCache);
  try {
    const res = await conTimeout(fetch(req), TIMEOUT_RED_MS);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const guardado = await cache.match(req);
    if (guardado) {
      // Se marca para que la UI sepa que este dato viene de la caché.
      const cabeceras = new Headers(guardado.headers);
      cabeceras.set("X-Desde-Cache", "1");
      return new Response(guardado.body, {
        status: guardado.status,
        statusText: guardado.statusText,
        headers: cabeceras,
      });
    }
    throw new Error("sin red y sin caché");
  }
}

async function cachePrimero(req, nombreCache, maximo) {
  const cache = await caches.open(nombreCache);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const res = await fetch(req);
  if (res && res.ok) {
    await cache.put(req, res.clone());
    if (maximo) void podarCache(nombreCache, maximo);
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // El stream SSE no se cachea nunca: es una conexión viva.
  if (url.pathname.startsWith("/api/estado/stream")) return;
  if (url.pathname.startsWith("/api/simulacion")) return;

  // Tiles del mapa.
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(
      cachePrimero(req, CACHE_TILES, MAX_TILES).catch(() => Response.error()),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/estado" || url.pathname === "/api/senda") {
    event.respondWith(redPrimeroConRespaldo(req, CACHE_DATOS).catch(() => Response.error()));
    return;
  }

  // Navegación: si no hay red, se sirve el armazón cacheado.
  if (req.mode === "navigate") {
    event.respondWith(
      redPrimeroConRespaldo(req, CACHE_APP).catch(async () => {
        const c = await caches.open(CACHE_APP);
        return (await c.match("/")) ?? Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icono") ||
    url.pathname.startsWith("/fuentes/")) {
    event.respondWith(cachePrimero(req, CACHE_APP).catch(() => Response.error()));
  }
});
