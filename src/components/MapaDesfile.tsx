"use client";

import lineSliceAlong from "@turf/line-slice-along";
import maplibregl, { type LngLatBoundsLike, type Map as MapaGL, type Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, LineString } from "geojson";

import { COLOR_NIVEL, type Densidad } from "@/lib/densidad";
import { sinSenal } from "@/lib/eta";
import { haceCuanto } from "@/lib/formato";
import { SENDA } from "@/lib/senda";
import { ROLES, type EstadoDesfile, type Rol, type TipoHito } from "@/lib/tipos";
import type { Ubicacion } from "@/lib/hooks/useUbicacion";

const NOMBRE: Record<Rol, string> = { cabeza: "Cabeza", mitad: "Mitad", cola: "Cola" };

/**
 * Tiles raster de OpenStreetMap: gratis y sin tarjeta.
 * OJO: la política de uso de tile.openstreetmap.org NO admite el tráfico de una app
 * masiva. Antes del 31 de diciembre hay que migrar a tiles propios (Protomaps/MapTiler).
 * Ver README, "Los tiles del mapa no aguantan el 31 de diciembre".
 */
const ESTILO_MAPA: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#eceae2" } },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      // Mapa base lavado, casi papel: lo que tiene que saltar a la vista es la senda.
      paint: {
        "raster-saturation": -0.72,
        "raster-contrast": -0.18,
        "raster-brightness-min": 0.12,
        "raster-opacity": 0.62,
      },
    },
  ],
};

/**
 * Iconos de los puntos de referencia. Son lo que la gente busca con la vista
 * desde la acera: la iglesia, el centro comercial, el colegio.
 */
const ICONO_HITO: Record<TipoHito, string> = {
  iglesia: '<path d="M12 2v3M10.5 3.5h3M12 5 7 9v12h10V9z"/>',
  comercial: '<path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2"/>',
  colegio: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5"/>',
  universidad: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5"/>',
  plaza: '<path d="M4 20h16M7 20V9l5-4 5 4v11"/><path d="M10 20v-5h4v5"/>',
  parque: '<path d="M12 3 7 12h10zM12 8l-4 7h8z"/><path d="M12 15v6"/>',
  estadio: '<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="4" ry="2.6"/>',
  hospital: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
};

/** Debajo de este zoom solo se pinta el icono: las etiquetas se pisarían. */
const ZOOM_ETIQUETAS = 13.6;

/** Un punto de interés sobre la senda: una tarima, un comercio. */
export interface PuntoMapa {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  categoria: string;
  grupo: "tarima" | "comercio";
  descripcion?: string;
  direccion?: string;
  horario?: string;
  /** Oferta del comercio. Solo la tienen los que contrataron espacio. */
  promo?: string | null;
  /** null = aparece en el directorio sin haber pagado. */
  plan?: "basico" | "destacado" | null;
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

const COLOR_PUNTO: Record<string, string> = {
  presentacion: "#a06bff",
};

/** Iconos por categoría de comercio. */
const ICONO_PUNTO: Record<string, string> = {
  presentacion: '<path d="M4 18V9l8-5 8 5v9z"/>',
  restaurante: '<path d="M7 2v9M5 2v5a2 2 0 0 0 4 0V2M7 11v11M17 2c-1.5 1-2 3-2 5s.5 3 2 3v12"/>',
  tasca: '<path d="M5 3h14l-6 8v7h3v3H8v-3h3v-7z"/>',
  cafe: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h2a2.5 2.5 0 0 1 0 5h-2M6 2v3M10 2v3M14 2v3"/>',
  heladeria: '<path d="M8 9a4 4 0 1 1 8 0zM7.5 10h9L12 22z"/>',
  panaderia: '<path d="M4 12c0-3 2-5 4-5h8c2 0 4 2 4 5v2a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM9 8v9M15 8v9"/>',
  tienda: '<path d="M4 9h16v10H4zM4 9l1.5-5h13L20 9M9 19v-5h6v5"/>',
  bar: '<path d="M9 3h6v4c0 1-1 2-1 3v10h-4V10c0-1-1-2-1-3zM9 7h6"/>',
  farmacia: '<path d="M5 5h14v14H5zM12 8v8M8 12h8"/>',
};

const ICONO_POR_DEFECTO = '<circle cx="12" cy="12" r="7"/>';

export type Encuadre =
  | { modo: "todo" | "yo" | "cabeza"; nonce: number }
  | { modo: "punto"; lat: number; lng: number; nonce: number };

interface Props {
  estado: EstadoDesfile | null;
  puntos: PuntoMapa[];
  /** null = capa apagada o sin muestra suficiente: no se pinta nada. */
  densidad: Densidad | null;
  /** Id del punto abierto en la ficha, para resaltarlo. */
  puntoSeleccionado: string | null;
  onPuntoClick: (punto: PuntoMapa) => void;
  ubicacion: Ubicacion | null;
  ahora: number;
  modoMarcarPunto: boolean;
  onPuntoMarcado: (lat: number, lng: number) => void;
  encuadre: Encuadre | null;
}

function limitesSenda(): LngLatBoundsLike {
  const b = new maplibregl.LngLatBounds();
  for (const c of SENDA.geojson.geometry.coordinates) b.extend([c[0], c[1]]);
  return b;
}

const COLECCION_VACIA: FeatureCollection = { type: "FeatureCollection", features: [] };

const LINEA_VACIA: Feature<LineString> = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
};

/** Corta la senda entre dos marcas de metros, con guardas para los extremos. */
function tramo(desdeM: number, hastaM: number): Feature<LineString> {
  const a = Math.max(0, Math.min(desdeM, SENDA.longitudMetros));
  const b = Math.max(0, Math.min(hastaM, SENDA.longitudMetros));
  if (b - a < 1) return LINEA_VACIA;
  try {
    return lineSliceAlong(SENDA.geojson, a / 1000, b / 1000, { units: "kilometers" });
  } catch {
    return LINEA_VACIA;
  }
}

function etiquetaCabeza(ts: number, ahora: number, apagado: boolean): string {
  if (apagado) return "sin señal";
  return `Va por acá · ${haceCuanto(ts, ahora).replace("hace ", "")}`;
}

export default function MapaDesfile({
  estado,
  puntos,
  densidad,
  puntoSeleccionado,
  onPuntoClick,
  ubicacion,
  ahora,
  modoMarcarPunto,
  onPuntoMarcado,
  encuadre,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  // El ref sirve para los chequeos imperativos; el estado, para que los efectos
  // que pintan vuelvan a correr cuando el mapa termina de cargar. Sin el estado,
  // un `estado` que llega antes que el `load` no se dibujaría hasta el siguiente
  // cambio — y si el desfile ya terminó, no hay siguiente.
  const listo = useRef(false);
  const [mapaListo, setMapaListo] = useState(false);
  const marcadores = useRef(new Map<Rol, Marker>());
  const marcadoresPunto = useRef(new Map<string, Marker>());
  const marcadoresHito = useRef(new Map<string, Marker>());
  const [zoom, setZoom] = useState(13);
  const marcadorYo = useRef<Marker | null>(null);
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
      style: ESTILO_MAPA,
      bounds: limitesSenda(),
      fitBoundsOptions: { padding: 56 },
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
      m.addSource("senda", { type: "geojson", data: SENDA.geojson });

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
            ["get", "nivel"],
            "lleno",
            COLOR_NIVEL.lleno,
            "con_gente",
            COLOR_NIVEL.con_gente,
            COLOR_NIVEL.tranquilo,
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
    };
  }, []);

  useEffect(() => {
    const c = contenedor.current;
    if (c) c.style.cursor = modoMarcarPunto ? "crosshair" : "";
  }, [modoMarcarPunto]);

  // --- Marcadores del desfile ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current || !estado) return;

    for (const rol of ROLES) {
      const pos = estado.posiciones[rol];
      const existente = marcadores.current.get(rol);

      if (!pos) {
        existente?.remove();
        marcadores.current.delete(rol);
        continue;
      }

      const apagado = sinSenal(pos.ts, ahora);

      if (existente) {
        existente.setLngLat([pos.lng, pos.lat]);
        const el = existente.getElement();
        el.querySelector(".marcador")?.classList.toggle("marcador--apagado", apagado);
        const globo = el.querySelector(".globo-cabeza");
        if (globo) globo.textContent = etiquetaCabeza(pos.ts, ahora, apagado);
        continue;
      }

      const raiz = document.createElement("div");
      raiz.className = "marcador-desfile";

      const punto = document.createElement("div");
      punto.className = `marcador marcador--${rol}${apagado ? " marcador--apagado" : ""}`;
      punto.setAttribute("role", "img");
      punto.setAttribute("aria-label", NOMBRE[rol]);
      punto.title = NOMBRE[rol];
      // La cabeza lleva el triángulo de "va hacia allá". Un "1" no se entiende solo.
      if (rol === "cabeza") {
        punto.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M6 3l12 9-12 9z"/></svg>';
      }
      raiz.appendChild(punto);

      if (rol === "cabeza") {
        const globo = document.createElement("div");
        globo.className = "globo-cabeza";
        globo.textContent = etiquetaCabeza(pos.ts, ahora, apagado);
        raiz.appendChild(globo);
      }

      marcadores.current.set(
        rol,
        new maplibregl.Marker({ element: raiz }).setLngLat([pos.lng, pos.lat]).addTo(m),
      );
    }
  }, [estado, ahora, mapaListo]);

  // --- Los tres tramos de la senda ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current || !estado) return;

    const fuenteFalta = m.getSource("tramo-falta") as maplibregl.GeoJSONSource | undefined;
    const fuenteDesfile = m.getSource("tramo-desfile") as maplibregl.GeoJSONSource | undefined;
    if (!fuenteFalta || !fuenteDesfile) return;

    const cabeza = estado.posiciones.cabeza;
    if (!cabeza) {
      // Sin reportes, toda la senda está por recorrer.
      fuenteFalta.setData(tramo(0, SENDA.longitudMetros));
      fuenteDesfile.setData(LINEA_VACIA);
      return;
    }

    fuenteFalta.setData(tramo(cabeza.metros, SENDA.longitudMetros));
    fuenteDesfile.setData(tramo(estado.posiciones.cola?.metros ?? 0, cabeza.metros));
  }, [estado, mapaListo]);

  // --- Puntos de referencia ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;

    for (const h of SENDA.hitos) {
      if (marcadoresHito.current.has(h.id)) continue;

      const el = document.createElement("div");
      el.className = "hito";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", h.nombre);
      el.title = h.nombre;
      el.innerHTML =
        `<span class="hito__icono"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" ` +
        `stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ` +
        `aria-hidden="true">${ICONO_HITO[h.tipo]}</svg></span>` +
        `<span class="hito__nombre">${h.corto}</span>`;

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

    const vigentes = new Set(puntos.map((p) => p.id));
    for (const [id, marcador] of marcadoresPunto.current) {
      if (!vigentes.has(id)) {
        marcador.remove();
        marcadoresPunto.current.delete(id);
      }
    }

    for (const p of puntos) {
      if (marcadoresPunto.current.has(p.id)) continue;
      const color = COLOR_PUNTO[p.categoria] ?? COLOR_COMERCIO;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "punto-mapa";
      el.style.setProperty("--color-punto", color);
      el.setAttribute("aria-label", `${p.nombre}. Ver información.`);
      el.title = p.nombre;
      el.innerHTML =
        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
        `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
        `${ICONO_PUNTO[p.categoria] ?? ICONO_POR_DEFECTO}</svg>`;

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
  }, [puntos, mapaListo]);

  // Resalta el punto cuya ficha está abierta.
  useEffect(() => {
    for (const [id, marcador] of marcadoresPunto.current) {
      marcador.getElement().classList.toggle("punto-mapa--activo", id === puntoSeleccionado);
    }
  }, [puntoSeleccionado, puntos]);

  // --- Gentío ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;
    const fuente = m.getSource("gentio") as maplibregl.GeoJSONSource | undefined;
    if (!fuente) return;

    if (!densidad || !densidad.suficiente) {
      fuente.setData(COLECCION_VACIA);
      return;
    }

    fuente.setData({
      type: "FeatureCollection",
      features: densidad.bins.map((b) => ({
        ...tramo(b.desdeM, b.hastaM),
        properties: { nivel: b.nivel, conteo: b.conteo },
      })),
    } as FeatureCollection);
  }, [densidad, mapaListo]);

  // --- Marcador del usuario ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo.current) return;

    if (!ubicacion) {
      marcadorYo.current?.remove();
      marcadorYo.current = null;
      return;
    }

    if (marcadorYo.current) {
      marcadorYo.current.setLngLat([ubicacion.lng, ubicacion.lat]);
      return;
    }

    const el = document.createElement("div");
    el.className = "marcador-usuario";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Tu ubicación");
    el.innerHTML = '<span></span><span class="halo"></span><span></span>';
    marcadorYo.current = new maplibregl.Marker({ element: el })
      .setLngLat([ubicacion.lng, ubicacion.lat])
      .addTo(m);
  }, [ubicacion, mapaListo]);

  // --- Reencuadre a pedido ---
  useEffect(() => {
    const m = mapa.current;
    if (!m || !encuadre) return;

    if (encuadre.modo === "todo") {
      m.fitBounds(limitesSenda(), { padding: 56, duration: 600 });
      return;
    }
    if (encuadre.modo === "yo" && ubicacion) {
      m.easeTo({ center: [ubicacion.lng, ubicacion.lat], zoom: 15.5, duration: 600 });
      return;
    }
    if (encuadre.modo === "cabeza" && estado?.posiciones.cabeza) {
      const c = estado.posiciones.cabeza;
      m.easeTo({ center: [c.lng, c.lat], zoom: 15.5, duration: 600 });
      return;
    }
    if (encuadre.modo === "punto") {
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
