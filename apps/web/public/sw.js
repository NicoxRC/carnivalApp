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
 *   - /api/state, /api/schedule y /api/businesses del API
 *                          -> red primero con timeout corto, y si falla,
 *                             se devuelve la última respuesta cacheada.
 *                             Es preferible un dato viejo con su hora que un error.
 *                             La programación y los comercios se precargan al
 *                             instalar: «Hoy» y la capa de comercios abren sin red.
 *   - /api/state/stream    -> nunca (es una conexión viva)
 *   - el resto del API     -> no pasa por aquí (escrituras, paneles privados)
 *
 * El API vive en otro origen. Llega en la URL con la que se registra este
 * archivo (`/sw.js?api=https://…`, ver `RegistrarSW.tsx`).
 */

// Subir la versión cada vez que cambie `public/mapa/pasto.pmtiles`: el archivo
// se guarda por su ruta, así que sin esto los celulares se quedan con el viejo.
const VERSION = "v6";
const CACHE_APP = `sed-app-${VERSION}`;
const CACHE_MAPA = `sed-mapa-${VERSION}`;
const CACHE_DATOS = `sed-datos-${VERSION}`;

const RUTA_TESELAS = "/mapa/pasto.pmtiles";

/** Origen del backend, o null si no vino (entonces no se guarda nada del API). */
const ORIGEN_API = (() => {
  try {
    const api = new URL(self.location.href).searchParams.get("api");
    const url = api ? new URL(api) : null;
    return url && (url.protocol === "https:" || url.protocol === "http:") ? url.origin : null;
  } catch {
    return null;
  }
})();

/** Lo del API que se sirve sin red: la última copia, marcada como tal. */
const RUTAS_API_CON_RESPALDO = new Set(["/api/state", "/api/schedule", "/api/businesses"]);

/** Lo del API que se precarga al instalar. `/api/state` no: sin desfile actual da 404. */
const PRECARGA_API = ["/api/schedule", "/api/businesses"];
const ICONO_AVISO = "/icono-192.png";

const PRECARGA = [
  "/",
  "/hoy",
  "/desfiles",
  "/fotos",
  "/icono.svg",
  "/icono-192.png",
  "/mapa/maplibre-worker.mjs",
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
      ORIGEN_API
        ? caches
            .open(CACHE_DATOS)
            .then((c) => Promise.allSettled(PRECARGA_API.map((ruta) => c.add(new URL(ruta, ORIGEN_API).href))))
        : null,
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

let rutaDelBuffer = null;

/* `ruta` y no una constante: el archivo puede vivir en otra ruta del mismo
   origen (NEXT_PUBLIC_MAPA_PMTILES). Solo se guarda uno en memoria. */
async function archivoTeselas(ruta) {
  if (bufferTeselas && rutaDelBuffer === ruta) return bufferTeselas;
  const cache = await caches.open(CACHE_MAPA);
  let res = await cache.match(ruta);
  if (!res) {
    const red = await fetch(ruta);
    if (!red.ok || red.status !== 200) return null;
    await cache.put(ruta, red.clone());
    res = red;
  }
  bufferTeselas = await res.arrayBuffer();
  rutaDelBuffer = ruta;
  return bufferTeselas;
}

async function servirTeselas(req) {
  let buffer = null;
  try {
    buffer = await archivoTeselas(new URL(req.url).pathname);
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

  if (ORIGEN_API && url.origin === ORIGEN_API) {
    // El stream SSE nunca entra aquí: no está en la lista.
    if (RUTAS_API_CON_RESPALDO.has(url.pathname)) {
      event.respondWith(redPrimeroConRespaldo(req, CACHE_DATOS).catch(() => Response.error()));
    }
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Cualquier .pmtiles de nuestro origen. Uno servido desde OTRO dominio no pasa
  // por aquí (ver el `return` de arriba) y por tanto no queda disponible sin red.
  if (url.pathname.endsWith(".pmtiles")) {
    event.respondWith(servirTeselas(req).catch(() => Response.error()));
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
    url.pathname.startsWith("/mapa/fuentes/") ||
    url.pathname === "/mapa/maplibre-worker.mjs") {
    event.respondWith(cachePrimero(req, CACHE_APP).catch(() => Response.error()));
  }
});

/* ------------------------------------------------------------------ */
/* Avisos "el desfile está cerca"                                      */
/* ------------------------------------------------------------------ */

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    // Un push sin cuerpo legible igual tiene que mostrar algo: el navegador lo exige.
  }
  event.waitUntil(
    self.registration.showNotification(datos.titulo || "Sigue el Desfile", {
      body: datos.cuerpo || "El desfile se está acercando a donde estás.",
      icon: ICONO_AVISO,
      badge: ICONO_AVISO,
      tag: "desfile-cerca",
      vibrate: [200, 100, 200],
      data: { url: datos.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      // Si la app ya está abierta se trae al frente, en vez de abrir otra.
      for (const v of ventanas) if ("focus" in v) return v.focus();
      return self.clients.openWindow(destino);
    }),
  );
});
