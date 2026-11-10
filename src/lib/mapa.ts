import * as maplibregl from "maplibre-gl";
import { type LngLatBoundsLike } from "maplibre-gl";
import { Protocol } from "pmtiles";

import capasBase from "@/data/estilo-mapa.json";

/**
 * Mapa base propio: un solo archivo `.pmtiles` con Pasto (≈2,4 MB), servido
 * desde nuestro dominio. No depende de los servidores de OpenStreetMap, que
 * bloquean a una app con miles de usuarios, y el service worker lo guarda
 * entero: el mapa abre aunque la celda esté saturada.
 *
 * Solo se importa desde componentes que corren en el navegador (MapLibre toca
 * `window`). Ver README, «El mapa base».
 */

/**
 * Dónde está el archivo de teselas. Por defecto, en `public/`. Si algún día pesa
 * demasiado para el despliegue, se sube a un almacenamiento (R2, S3) y se apunta
 * aquí; el service worker lo sigue cacheando igual si es del mismo origen.
 */
export const URL_TESELAS = process.env.NEXT_PUBLIC_MAPA_PMTILES || "/mapa/pasto.pmtiles";

/**
 * El área que cubre el archivo de teselas. Fuera de aquí el mapa queda en
 * blanco, así que no se deja arrastrar más allá.
 */
export const LIMITES_TESELAS: LngLatBoundsLike = [
  [-77.33, 1.16],
  [-77.23, 1.26],
];

/** Las teselas llegan hasta z15; MapLibre las amplía más allá sin pedir nada nuevo. */
export const ZOOM_MIN = 12;
export const ZOOM_MAX = 19;

let protocoloRegistrado = false;

export function estiloMapa(): maplibregl.StyleSpecification {
  if (!protocoloRegistrado) {
    maplibregl.addProtocol("pmtiles", new Protocol().tile);
    protocoloRegistrado = true;
  }
  // MapLibre exige URLs absolutas para las teselas y las fuentes.
  const origen = window.location.origin;
  const teselas = new URL(URL_TESELAS, origen).href;
  return {
    version: 8,
    glyphs: `${origen}/mapa/fuentes/{fontstack}/{range}.pbf`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${teselas}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: capasBase as maplibregl.LayerSpecification[],
  };
}
