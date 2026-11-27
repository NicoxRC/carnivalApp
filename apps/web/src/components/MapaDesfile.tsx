"use client";

import lineSliceAlong from "@turf/line-slice-along";
import * as maplibregl from "maplibre-gl";
import { type LngLatBoundsLike, type Map as MapaGL, type Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, LineString } from "geojson";

import { LEVEL_COLOR, type Density } from "@/lib/density";
import { noSignal } from "@/lib/eta";
import { timeAgo } from "@/lib/format";
import { mapStyle, TILES_BOUNDS, ZOOM_MAX, ZOOM_MIN } from "@/lib/map";
import { pointAtMetre, COURSE } from "@/lib/course";
import { POSTS, type ParadeState, type Post, type WaypointKind } from "@/lib/types";
import type { UserLocation } from "@/lib/hooks/useUserLocation";

const NOMBRE: Record<Post, string> = { head: "Cabeza", middle: "Mitad", tail: "Cola" };

/**
 * Iconos de los puntos de referencia. Son lo que la gente busca con la vista
 * desde la acera: la iglesia, el centro comercial, el colegio.
 */
const ICONO_HITO: Record<WaypointKind, string> = {
  church: '<path d="M12 2v3M10.5 3.5h3M12 5 7 9v12h10V9z"/>',
  mall: '<path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2"/>',
  school: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5"/>',
  university: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5"/>',
  square: '<path d="M4 20h16M7 20V9l5-4 5 4v11"/><path d="M10 20v-5h4v5"/>',
  park: '<path d="M12 3 7 12h10zM12 8l-4 7h8z"/><path d="M12 15v6"/>',
  stadium: '<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="4" ry="2.6"/>',
  hospital: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
};

/** Debajo de este zoom solo se pinta el icono: las etiquetas se pisarían. */
const ZOOM_ETIQUETAS = 13.6;

/** Un punto de interés sobre la senda: una tarima, un comercio. */
export interface PuntoMapa {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  grupo: "tarima" | "comercio" | "servicio";
  description?: string;
  address?: string;
  hours?: string;
  /** Oferta del comercio. Solo la tienen los que contrataron espacio. */
  offer?: string | null;
  /** null = aparece en el directorio sin haber pagado. */
  plan?: "basic" | "featured" | null;
  /** Solo con plan. */
  menu?: { name: string; price: string }[];
  whatsapp?: string | null;
  link?: string | null;
}

/**
 * Los PDI se distinguen por FORMA (cuadrado redondeado) frente a los marcadores
 * del desfile (círculos), no por color: el morado de una tarima y el de la cola
 * son el mismo, tal como venía en el diseño.
 *
 * Dentro de los comercios el color NO cambia por categoría: un solo verde azulado
 * y el icono carga el significado. Con ocho colores más el mapa se vuelve ilegible
 * justo donde hay más cosas.
 */
const COLOR_COMERCIO = "#2fa898";

/** Los servicios van en azul: es el color de "información", no de comercio. */
const COLOR_SERVICIO = "#1487cc";

const COLOR_PUNTO: Record<string, string> = {
  stage: "#a06bff",
  toilet: COLOR_SERVICIO,
  water: COLOR_SERVICIO,
  first_aid: "#c0271b",
  police: COLOR_SERVICIO,
  road_closure: "#8a5a00",
};

/** Iconos por categoría de comercio. */
const ICONO_PUNTO: Record<string, string> = {
  stage: '<path d="M4 18V9l8-5 8 5v9z"/>',
  restaurant: '<path d="M7 2v9M5 2v5a2 2 0 0 0 4 0V2M7 11v11M17 2c-1.5 1-2 3-2 5s.5 3 2 3v12"/>',
  tasca: '<path d="M5 3h14l-6 8v7h3v3H8v-3h3v-7z"/>',
  cafe: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h2a2.5 2.5 0 0 1 0 5h-2M6 2v3M10 2v3M14 2v3"/>',
  ice_cream: '<path d="M8 9a4 4 0 1 1 8 0zM7.5 10h9L12 22z"/>',
  bakery: '<path d="M4 12c0-3 2-5 4-5h8c2 0 4 2 4 5v2a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM9 8v9M15 8v9"/>',
  shop: '<path d="M4 9h16v10H4zM4 9l1.5-5h13L20 9M9 19v-5h6v5"/>',
  bar: '<path d="M9 3h6v4c0 1-1 2-1 3v10h-4V10c0-1-1-2-1-3zM9 7h6"/>',
  pharmacy: '<path d="M5 5h14v14H5zM12 8v8M8 12h8"/>',
  toilet: '<circle cx="8" cy="5" r="2"/><circle cx="16" cy="5" r="2"/><path d="M8 9v11M5.5 13h5M16 9l-2.5 6h5zM16 15v5"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  first_aid: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  police: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z"/>',
  road_closure: '<circle cx="12" cy="12" r="9"/><path d="M7 12h10"/>',
};

const ICONO_POR_DEFECTO = '<circle cx="12" cy="12" r="7"/>';

export type Encuadre =
  | { mode: "todo" | "yo" | "head"; nonce: number }
  | { mode: "punto"; lat: number; lng: number; nonce: number };

interface Props {
  state: ParadeState | null;
  points: PuntoMapa[];
  /** null = capa apagada o sin muestra suficiente: no se pinta nada. */
  density: Density | null;
  /** Id del punto abierto en la ficha, para resaltarlo. */
  puntoSeleccionado: string | null;
  onPuntoClick: (punto: PuntoMapa) => void;
  location: UserLocation | null;
  now: number;
  modoMarcarPunto: boolean;
  onPuntoMarcado: (lat: number, lng: number) => void;
  encuadre: Encuadre | null;
  /** Punto de encuentro que alguien compartió, en metros sobre la senda. */
  encuentroM?: number | null;
}

function limitesSenda(): LngLatBoundsLike {
  const b = new maplibregl.LngLatBounds();
  for (const c of COURSE.geojson.geometry.coordinates) b.extend([c[0], c[1]]);
  return b;
}

const COLECCION_VACIA: FeatureCollection = { type: "FeatureCollection", features: [] };

const LINEA_VACIA: Feature<LineString> = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
};

/** Corta la senda entre dos marcas de metros, con guardas para los extremos. */
function tramo(fromM: number, toM: number): Feature<LineString> {
  const a = Math.max(0, Math.min(fromM, COURSE.lengthMetres));
  const b = Math.max(0, Math.min(toM, COURSE.lengthMetres));
  if (b - a < 1) return LINEA_VACIA;
  try {
    return lineSliceAlong(COURSE.geojson, a / 1000, b / 1000, { units: "kilometers" });
  } catch {
    return LINEA_VACIA;
  }
}

function etiquetaCabeza(ts: number, now: number, off: boolean): string {
  if (off) return "sin señal";
  return `Va por acá · ${timeAgo(ts, now).replace("hace ", "")}`;
}

export default function MapaDesfile({
  state,
  points,
  density,
  puntoSeleccionado,
  onPuntoClick,
  location,
  now,
  modoMarcarPunto,
  onPuntoMarcado,
  encuadre,
  encuentroM = null,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  // El ref sirve para los chequeos imperativos; el estado, para que los efectos
  // que pintan vuelvan a correr cuando el mapa termina de cargar. Sin el estado,
  // un `estado` que llega antes que el `load` no se dibujaría hasta el siguiente
  // cambio — y si el desfile ya terminó, no hay siguiente.
  const listo = useRef(false);
  const [mapaListo, setMapaListo] = useState(false);
  const marcadores = useRef(new Map<Post, Marker>());
  const marcadoresPunto = useRef(new Map<string, Marker>());
  const marcadoresHito = useRef(new Map<string, Marker>());
  const [zoom, setZoom] = useState(13);
  const marcadorYo = useRef<Marker | null>(null);
  const marcadorEncuentro = useRef<Marker | null>(null);
  const onPunto = useRef(onPuntoMarcado);
  const onClickPunto = useRef(onPuntoClick);
  const marcando = useRef(modoMarcarPunto);

  onPunto.current = onPuntoMarcado;
  onClickPunto.current = onPuntoClick;
  marcando.current = modoMarcarPunto;

  // --- Montaje ---
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const m = new maplibregl.Map({
      container: contenedor.current,
      style: mapStyle(),
      bounds: limitesSenda(),
      fitBoundsOptions: { padding: 56 },
      maxBounds: TILES_BOUNDS,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      attributionControl: { compact: true },
      // Un desfile no necesita brújula ni inclinación; quitarlas evita toques accidentales.
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
    });
    m.touchZoomRotate.disableRotation();

    // MapLibre no lanza: avisa por este evento. Sin esto, un estilo o unos tiles
    // que fallan dejan el mapa en blanco sin una sola pista en consola.
    m.on("error", (e) => console.error("[mapa]", e.error?.message ?? e));

    // Handle para inspeccionar el mapa desde la consola (window.__mapa.getStyle()).
    // Solo en desarrollo; el build de producción lo elimina.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __mapa?: MapaGL }).__mapa = m;
    }

    m.on("load", () => {
      // Tres tramos con tratamiento distinto, según el diseño: lo ya recorrido en
      // gris fino, el cuerpo del desfile en naranja grueso, y lo que falta en línea
      // punteada oscura. Como `line-dasharray` no se puede combinar con
      // `line-gradient`, cada tramo tiene que ser su propia capa.
      m.addSource("gentio", { type: "geojson", data: COLECCION_VACIA });
      m.addSource("senda", { type: "geojson", data: COURSE.geojson });

      // El gentío va DEBAJO de la senda y difuminado: es contexto, no el dato
      // principal. Si compitiera con la línea del desfile, estorbaría.
      m.addLayer({
        id: "gentio",
        type: "line",
        source: "gentio",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          // Ancho y difuminado: tiene que leerse como una mancha alrededor del
          // recorrido, no como otra línea que compita con la del desfile.
          // Se ciñe a la senda porque es lo único que medimos: gente sobre la
          // senda, no en las calles de al lado.
          "line-width": 38,
          "line-blur": 16,
          "line-opacity": 0.62,
          "line-color": [
            "match",
            ["get", "level"],
            "full",
            LEVEL_COLOR.full,
            "busy",
            LEVEL_COLOR.busy,
            LEVEL_COLOR.calm,
          ],
        },
      });
      m.addSource("tramo-falta", { type: "geojson", data: LINEA_VACIA });
      m.addSource("tramo-desfile", { type: "geojson", data: LINEA_VACIA });

      m.addLayer({
        id: "senda-recorrida",
        type: "line",
        source: "senda",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#bdbbb2", "line-width": 9 },
      });

      m.addLayer({
        id: "senda-falta",
        type: "line",
        source: "tramo-falta",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#141414", "line-width": 6, "line-dasharray": [0.5, 2] },
      });

      m.addLayer({
        id: "senda-desfile",
        type: "line",
        source: "tramo-desfile",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ff6a1f", "line-width": 11 },
      });

      listo.current = true;
      setMapaListo(true);
      m.resize();
    });

    m.on("zoom", () => setZoom(m.getZoom()));

    m.on("click", (e) => {
      if (!marcando.current) return;
      onPunto.current(e.lngLat.lat, e.lngLat.lng);
    });

    mapa.current = m;

    return () => {
      m.remove();
      mapa.current = null;
      listo.current = false;
      setMapaListo(false);
      marcadores.current.clear();
      marcadoresPunto.current.clear();
      marcadoresHito.current.clear();
      marcadorYo.current = null;
      marcadorEncuentro.current = null;
    };
  }, []);

  useEffect(() => {
    const c = contenedor.current;
    if (c) c.style.cursor = modoMarcarPunto ? "crosshair" : "";
  }, [modoMarcarPunto]);

  // --- Marcadores del desfile ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current || !state) return;

    for (const post of POSTS) {
      const pos = state.positions[post];
      const existente = marcadores.current.get(post);

      if (!pos) {
        existente?.remove();
        marcadores.current.delete(post);
        continue;
      }

      const off = noSignal(pos.ts, now);

      if (existente) {
        existente.setLngLat([pos.lng, pos.lat]);
        const el = existente.getElement();
        el.querySelector(".marcador")?.classList.toggle("marcador--apagado", off);
        const globo = el.querySelector(".globo-cabeza");
        if (globo) globo.textContent = etiquetaCabeza(pos.ts, now, off);
        continue;
      }

      const root = document.createElement("div");
      root.className = "marcador-desfile";

      const punto = document.createElement("div");
      punto.className = `marcador marcador--${post}${off ? " marcador--apagado" : ""}`;
      punto.setAttribute("role", "img");
      punto.setAttribute("aria-label", NOMBRE[post]);
      punto.title = NOMBRE[post];
      // La cabeza lleva el triángulo de "va hacia allá". Un "1" no se entiende solo.
      if (post === "head") {
        punto.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M6 3l12 9-12 9z"/></svg>';
      }
      root.appendChild(punto);

      if (post === "head") {
        const globo = document.createElement("div");
        globo.className = "globo-cabeza";
        globo.textContent = etiquetaCabeza(pos.ts, now, off);
        root.appendChild(globo);
      }

      marcadores.current.set(
        post,
        new maplibregl.Marker({ element: root }).setLngLat([pos.lng, pos.lat]).addTo(m),
      );
    }
  }, [state, now, mapaListo]);

  // --- Los tres tramos de la senda ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current || !state) return;

    const fuenteFalta = m.getSource("tramo-falta") as maplibregl.GeoJSONSource | undefined;
    const fuenteDesfile = m.getSource("tramo-desfile") as maplibregl.GeoJSONSource | undefined;
    if (!fuenteFalta || !fuenteDesfile) return;

    const head = state.positions.head;
    if (!head) {
      // Sin reportes, toda la senda está por recorrer.
      fuenteFalta.setData(tramo(0, COURSE.lengthMetres));
      fuenteDesfile.setData(LINEA_VACIA);
      return;
    }

    fuenteFalta.setData(tramo(head.metres, COURSE.lengthMetres));
    fuenteDesfile.setData(tramo(state.positions.tail?.metres ?? 0, head.metres));
  }, [state, mapaListo]);

  // --- Puntos de referencia ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;

    for (const h of COURSE.waypoints) {
      if (marcadoresHito.current.has(h.id)) continue;

      const el = document.createElement("div");
      el.className = "hito";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", h.name);
      el.title = h.name;
      el.innerHTML =
        `<span class="hito__icono"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" ` +
        `stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ` +
        `aria-hidden="true">${ICONO_HITO[h.kind]}</svg></span>` +
        `<span class="hito__nombre">${h.short}</span>`;

      marcadoresHito.current.set(
        h.id,
        new maplibregl.Marker({ element: el }).setLngLat([h.lng, h.lat]).addTo(m),
      );
    }
  }, [mapaListo]);

  // Con el mapa alejado las etiquetas se pisan entre ellas: solo el icono.
  useEffect(() => {
    const mostrar = zoom >= ZOOM_ETIQUETAS;
    for (const marcador of marcadoresHito.current.values()) {
      marcador.getElement().classList.toggle("hito--sin-nombre", !mostrar);
    }
  }, [zoom, mapaListo]);

  // --- Puntos de interés (tarimas, tascas) ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;

    const vigentes = new Set(points.map((p) => p.id));
    for (const [id, marcador] of marcadoresPunto.current) {
      if (!vigentes.has(id)) {
        marcador.remove();
        marcadoresPunto.current.delete(id);
      }
    }

    for (const p of points) {
      if (marcadoresPunto.current.has(p.id)) continue;
      const color = COLOR_PUNTO[p.category] ?? COLOR_COMERCIO;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "punto-mapa";
      el.style.setProperty("--color-punto", color);
      el.setAttribute("aria-label", `${p.name}. Ver información.`);
      el.title = p.name;
      el.innerHTML =
        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
        `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
        `${ICONO_PUNTO[p.category] ?? ICONO_POR_DEFECTO}</svg>`;

      // Tocar un comercio abre su ficha. El stopPropagation evita que el clic
      // llegue al mapa y se interprete como "marcar mi ubicación aquí".
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onClickPunto.current(p);
      });

      marcadoresPunto.current.set(
        p.id,
        new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m),
      );
    }
  }, [points, mapaListo]);

  // Resalta el punto cuya ficha está abierta.
  useEffect(() => {
    for (const [id, marcador] of marcadoresPunto.current) {
      marcador.getElement().classList.toggle("punto-mapa--activo", id === puntoSeleccionado);
    }
  }, [puntoSeleccionado, points]);

  // --- Gentío ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;
    const fuente = m.getSource("gentio") as maplibregl.GeoJSONSource | undefined;
    if (!fuente) return;

    if (!density || !density.enough) {
      fuente.setData(COLECCION_VACIA);
      return;
    }

    fuente.setData({
      type: "FeatureCollection",
      features: density.bins.map((b) => ({
        ...tramo(b.fromM, b.toM),
        properties: { level: b.level, count: b.count },
      })),
    } as FeatureCollection);
  }, [density, mapaListo]);

  // --- Marcador del usuario ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;

    if (!location) {
      marcadorYo.current?.remove();
      marcadorYo.current = null;
      return;
    }

    if (marcadorYo.current) {
      marcadorYo.current.setLngLat([location.lng, location.lat]);
      return;
    }

    const el = document.createElement("div");
    el.className = "marcador-usuario";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Tu ubicación");
    el.innerHTML = '<span></span><span class="halo"></span><span></span>';
    marcadorYo.current = new maplibregl.Marker({ element: el })
      .setLngLat([location.lng, location.lat])
      .addTo(m);
  }, [location, mapaListo]);

  // --- Punto de encuentro compartido ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;
    marcadorEncuentro.current?.remove();
    marcadorEncuentro.current = null;
    if (encuentroM === null) return;
    const { lat, lng } = pointAtMetre(encuentroM);
    const el = document.createElement("div");
    el.className = "marcador-encuentro";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Punto de encuentro");
    el.innerHTML =
      '<svg width="34" height="34" viewBox="0 0 24 24" fill="#141414" stroke="#fff" stroke-width="1.4" aria-hidden="true"><path d="M12 22s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12z"/><circle cx="12" cy="10" r="2.6" fill="#ffc61a" stroke="none"/></svg>';
    marcadorEncuentro.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .addTo(m);
    m.easeTo({ center: [lng, lat], zoom: 15.5, duration: 600 });
  }, [encuentroM, mapaListo]);

  // --- Reencuadre a pedido ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !encuadre) return;

    if (encuadre.mode === "todo") {
      m.fitBounds(limitesSenda(), { padding: 56, duration: 600 });
      return;
    }
    if (encuadre.mode === "yo" && location) {
      m.easeTo({ center: [location.lng, location.lat], zoom: 15.5, duration: 600 });
      return;
    }
    if (encuadre.mode === "head" && state?.positions.head) {
      const c = state.positions.head;
      m.easeTo({ center: [c.lng, c.lat], zoom: 15.5, duration: 600 });
      return;
    }
    if (encuadre.mode === "punto") {
      // Se desplaza hacia arriba para que la ficha abierta no tape el marcador.
      m.easeTo({
        center: [encuadre.lng, encuadre.lat],
        zoom: 16,
        offset: [0, -120],
        duration: 600,
      });
    }
    // `encuadre.nonce` cambia en cada pedido: por eso esto se dispara aunque el modo repita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encuadre?.nonce]);

  // El envoltorio es el que posiciona. MapLibre le mete `position: relative` a SU
  // contenedor, así que si este llevara `absolute inset-0` quedaría con altura 0.
  return (
    <div className="absolute inset-0">
      <div ref={contenedor} className="h-full w-full" aria-label="Mapa del desfile" />
    </div>
  );
}
