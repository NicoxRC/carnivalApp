import along from "@turf/along";
import turfLength from "@turf/length";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { point } from "@turf/helpers";
import type { Feature, LineString } from "geojson";

import { SENDA_DEFINICION } from "@/data/senda-carnaval";
import { traducir, type Traductor } from "@/lib/i18n-textos";
import type { Hito, Senda } from "@/lib/tipos";

const enEspanol: Traductor = (clave, vars) => traducir("es", clave, vars);

/**
 * El modelo mental de toda la app: la senda es 1D.
 * Cualquier punto del mundo se proyecta sobre esta línea y se convierte
 * en un solo número — metros desde el inicio. El ETA es aritmética sobre ese número.
 */

const geojson = SENDA_DEFINICION.geojson;

function metrosDeLongitud(linea: Feature<LineString>): number {
  return turfLength(linea, { units: "kilometers" }) * 1000;
}

const longitudMetros = metrosDeLongitud(geojson);

// Cada hito se proyecta sobre la senda igual que cualquier otro punto: así se
// sabe en qué metro de la ruta queda y a qué distancia de ella está. Ordenados
// por avance para poder decir "va entre X e Y".
const hitos: Hito[] = SENDA_DEFINICION.hitos
  .map((h) => {
    const proy = metrosEnSenda(h.lat, h.lng);
    return { ...h, metros: proy.metros, desvioM: proy.desvioM };
  })
  .sort((a, b) => a.metros - b.metros);

export const SENDA: Senda = {
  id: SENDA_DEFINICION.id,
  nombre: SENDA_DEFINICION.nombre,
  oficial: SENDA_DEFINICION.oficial,
  advertencia: SENDA_DEFINICION.advertencia,
  geojson,
  longitudMetros,
  hitos,
};

export interface Proyeccion {
  /** Metros desde el inicio de la senda. */
  metros: number;
  /** Qué tan lejos de la senda estaba el punto original, en metros. */
  desvioM: number;
  /** El punto ya pegado a la senda. */
  lat: number;
  lng: number;
}

/**
 * Proyecta un punto cualquiera sobre la senda.
 * Es la única función que convierte (lat, lng) en el número que usa todo lo demás.
 */
export function metrosEnSenda(lat: number, lng: number): Proyeccion {
  const snap = nearestPointOnLine(geojson, point([lng, lat]), { units: "kilometers" });
  const [snapLng, snapLat] = snap.geometry.coordinates;
  return {
    metros: (snap.properties.location ?? 0) * 1000,
    desvioM: (snap.properties.dist ?? 0) * 1000,
    lat: snapLat,
    lng: snapLng,
  };
}

/** El inverso: dado un número de metros, ¿en qué coordenada de la senda cae? */
export function puntoEnMetro(metros: number): { lat: number; lng: number } {
  const acotado = Math.min(Math.max(metros, 0), longitudMetros);
  const p = along(geojson, acotado / 1000, { units: "kilometers" });
  const [lng, lat] = p.geometry.coordinates;
  return { lat, lng };
}

/** El hito más cercano a un punto de la senda. */
export function hitoMasCercano(metros: number): Hito | null {
  let mejor: Hito | null = null;
  let mejorDist = Infinity;
  for (const h of SENDA.hitos) {
    const d = Math.abs(h.metros - metros);
    if (d < mejorDist) {
      mejorDist = d;
      mejor = h;
    }
  }
  return mejor;
}

/** Se considera que algo "está en" un hito dentro de este radio. */
const RADIO_HITO_M = 180;

export interface Referencia {
  /** Frase lista para pintar: "va llegando a Cristo Rey". */
  frase: string;
  hito: Hito | null;
}

/**
 * Traduce un número de metros a algo que alguien parado en la acera entiende.
 *
 * "Carrera 27 con calle 18" es un dato de catastro: sirve para un plano, no para
 * alguien buscando dónde pararse. La gente se ubica por la iglesia y el centro
 * comercial, así que eso es lo que se dice.
 */
export function referenciaEnSenda(
  metros: number,
  sujeto: "va" | "estas" = "va",
  t: Traductor = enEspanol,
): Referencia {
  if (SENDA.hitos.length === 0) return { frase: "", hito: null };

  const cerca = hitoMasCercano(metros);
  if (cerca && Math.abs(cerca.metros - metros) <= RADIO_HITO_M) {
    return { frase: t(`ref.${sujeto}.por`, { a: cerca.nombre }), hito: cerca };
  }

  // Entre dos hitos: se nombran los dos, que es como se explica en la calle.
  const anterior = [...SENDA.hitos].reverse().find((h) => h.metros <= metros) ?? null;
  const siguiente = SENDA.hitos.find((h) => h.metros > metros) ?? null;

  if (anterior && siguiente) {
    return { frase: t(`ref.${sujeto}.entre`, { a: anterior.corto, b: siguiente.corto }), hito: siguiente };
  }
  if (siguiente) return { frase: t(`ref.${sujeto}.antes`, { a: siguiente.nombre }), hito: siguiente };
  if (anterior) return { frase: t(`ref.${sujeto}.paso`, { a: anterior.nombre }), hito: anterior };
  return { frase: "", hito: null };
}

/** El próximo hito que el desfile va a alcanzar, con cuánto le falta. */
export function proximoHito(metros: number): { hito: Hito; faltanM: number } | null {
  const siguiente = SENDA.hitos.find((h) => h.metros > metros + RADIO_HITO_M);
  if (!siguiente) return null;
  return { hito: siguiente, faltanM: siguiente.metros - metros };
}

/**
 * ¿Está el usuario lo bastante cerca de la senda como para que el ETA signifique algo?
 * Más allá de esto no tiene sentido decirle "el desfile llega en X".
 */
export const DESVIO_MAX_USUARIO_M = 600;
