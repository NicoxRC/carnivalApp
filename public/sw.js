/*
 * Service worker de "Sigue el Desfile".
 *
 * Premisa: el 31 de diciembre la celda va a estar saturada. La app tiene que
 * ABRIR igual, aunque los datos lleguen tarde o no lleguen.
 *
 * Estrategia por tipo de recurso:
 *   - armazón y estáticos  -> cache primero (la app abre sin red)
 *   - mapa base (.pmtiles) -> el archivo entero se guarda una vez y los
 *                             pedazos (Range) que pide el visor se sirven
 *                             desde la caché: el mapa abre sin red
 *   - fuentes del mapa     -> cache primero
 *   - /api/estado          -> red primero con timeout corto, y si falla,
 *                             se devuelve la última respuesta cacheada.
 *                             Es preferible un dato viejo con su hora que un error.
 *   - /api/comercios       -> igual que /api/estado: la capa funciona sin red
 *   - /api/posiciones      -> nunca se cachea (es escritura)
 *   - /api/admin, /api/reportero -> nunca se cachean (son privadas)
 */

// Subir la versión cada vez que cambie `public/mapa/pasto.pmtiles`: el archivo
// se guarda por su ruta, así que sin esto los celulares se quedan con el viejo.
const VERSION = "v3";
const CACHE_APP = `sed-app-${VERSION}`;
const CACHE_MAPA = `sed-mapa-${VERSION}`;
const CACHE_DATOS = `sed-datos-${VERSION}`;

const RUTA_TESELAS = "/mapa/pasto.pmtiles";

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

const TIMEOUT_RED_MS = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.allSettled([
      caches
        .open(CACHE_APP)
        // addAll falla entero si un recurso falla; se agregan uno a uno.
        .then((c) => Promise.allSettled(PRECARGA.map((u) => c.add(u)))),
      // El mapa base entero (≈2,4 MB), de una vez: es lo que permite abrir el
      // mapa con la celda saturada.
      caches.open(CACHE_MAPA).then((c) => c.add(RUTA_TESELAS)),
    ]).then(() => self.skipWaiting()),
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

async function cachePrimero(req, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const res = await fetch(req);
  if (res && res.ok) await cache.put(req, res.clone());
  return res;
}

/*
 * El visor no pide el .pmtiles entero: pide pedazos con la cabecera Range.
 * La Cache API no guarda respuestas parciales (206), así que se guarda el
 * archivo completo y los pedazos se recortan aquí. El buffer queda en memoria
 * mientras el service worker esté vivo, para no releerlo en cada tesela.
 */
let bufferTeselas = null;

async function archivoTeselas() {
  if (bufferTeselas) return bufferTeselas;
  const cache = await caches.open(CACHE_MAPA);
  let res = await cache.match(RUTA_TESELAS);
  if (!res) {
    const red = await fetch(RUTA_TESELAS);
    if (!red.ok || red.status !== 200) return null;
    await cache.put(RUTA_TESELAS, red.clone());
    res = red;
  }
  bufferTeselas = await res.arrayBuffer();
  return bufferTeselas;
}

async function servirTeselas(req) {
  let buffer = null;
  try {
    buffer = await archivoTeselas();
  } catch {
    // Sin caché y sin red: abajo se intenta la petición original.
  }
  if (!buffer) return fetch(req);

  const total = buffer.byteLength;
  const rango = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get("range") || "");
  if (!rango) {
    return new Response(buffer, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(total) },
    });
  }
  const inicio = Number(rango[1]);
  const fin = Math.min(rango[2] ? Number(rango[2]) : total - 1, total - 1);
  if (inicio > fin) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }
  return new Response(buffer.slice(inicio, fin + 1), {
    status: 206,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fin - inicio + 1),
      "Content-Range": `bytes ${inicio}-${fin}/${total}`,
    },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // El stream SSE no se cachea nunca: es una conexión viva.
  if (url.pathname.startsWith("/api/estado/stream")) return;
  if (url.pathname.startsWith("/api/simulacion")) return;

  if (url.origin !== self.location.origin) return;

  if (url.pathname === RUTA_TESELAS) {
    event.respondWith(servirTeselas(req).catch(() => Response.error()));
    return;
  }

  if (
    url.pathname === "/api/estado" ||
    url.pathname === "/api/senda" ||
    url.pathname === "/api/comercios"
  ) {
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
    url.pathname.startsWith("/fuentes/") ||
    url.pathname.startsWith("/mapa/fuentes/")) {
    event.respondWith(cachePrimero(req, CACHE_APP).catch(() => Response.error()));
  }
});
