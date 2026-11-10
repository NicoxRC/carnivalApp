import type { Feature, LineString } from "geojson";

/**
 * ⚠️ ESTE TRAZADO NO ES LA SENDA OFICIAL.
 *
 * Es una polilínea aproximada sobre Pasto, dibujada a mano solo para poder
 * desarrollar y demostrar la app antes de tener el recorrido real. Las calles
 * que nombran los hitos son orientativas, no verificadas.
 *
 * Antes de cualquier uso real hay que reemplazarla por el recorrido oficial de
 * Corpocarnaval. Ver README → "Cambiar la senda".
 *
 * Va en TypeScript y no en JSON a propósito: el script `npm run simular` corre
 * fuera del bundler de Next, donde importar JSON exige `with { type: "json" }`.
 */

export interface DefinicionSenda {
  id: string;
  nombre: string;
  oficial: boolean;
  advertencia?: string;
  ciudad: string;
  geojson: Feature<LineString>;
  hitos: HitoCrudo[];
}

/**
 * Un punto de referencia sobre la senda.
 *
 * ⚠️ Las coordenadas de abajo son INVENTADAS: están puestas a ojo sobre un
 * trazado que tampoco es el real. Los nombres sí son de sitios que existen en
 * Pasto, pero ninguno está verificado ni en su sitio. Es una plantilla para que
 * alguien con conocimiento local la corrija — reemplazar lat/lng y nombres, y
 * poner `oficial: true` cuando lo estén.
 */
export interface HitoCrudo {
  id: string;
  nombre: string;
  corto: string;
  tipo:
    | "iglesia"
    | "comercial"
    | "colegio"
    | "universidad"
    | "plaza"
    | "parque"
    | "estadio"
    | "hospital";
  lat: number;
  lng: number;
}

const coordenadas: [number, number][] = [
  [-77.29063, 1.23604],
  [-77.29011, 1.23512],
  [-77.28962, 1.23418],
  [-77.28918, 1.23319],
  [-77.28874, 1.23214],
  [-77.28829, 1.23106],
  [-77.28781, 1.22994],
  [-77.28736, 1.22881],
  [-77.28692, 1.22766],
  [-77.28648, 1.22651],
  [-77.28604, 1.22536],
  [-77.28558, 1.22421],
  [-77.28511, 1.22307],
  [-77.28462, 1.22194],
  [-77.28411, 1.22083],
  [-77.28356, 1.21975],
  [-77.28297, 1.21871],
  [-77.28234, 1.21772],
  [-77.28166, 1.21679],
  [-77.28093, 1.21592],
  [-77.28014, 1.21512],
  [-77.27931, 1.21439],
  [-77.27844, 1.21374],
  [-77.27754, 1.21316],
  [-77.27661, 1.21265],
  [-77.27566, 1.21219],
  [-77.2747, 1.21177],
  [-77.27374, 1.21136],
  [-77.27282, 1.21091],
  [-77.27196, 1.21038],
  [-77.27119, 1.20975],
  [-77.27053, 1.20903],
  [-77.27, 1.20823],
  [-77.26962, 1.20737],
];

export const SENDA_DEFINICION: DefinicionSenda = {
  id: "senda-provisional-pasto",
  nombre: "Senda del Carnaval (trazado provisional)",
  oficial: false,
  advertencia:
    "Trazado aproximado para desarrollo. Reemplazar por el recorrido oficial de Corpocarnaval.",
  ciudad: "San Juan de Pasto, Nariño, Colombia",
  geojson: {
    type: "Feature",
    properties: { nombre: "Senda del Carnaval (provisional)" },
    geometry: { type: "LineString", coordinates: coordenadas },
  },
  hitos: [
    {
      id: "h-udenar",
      nombre: "Universidad de Nariño",
      corto: "U. de Nariño",
      tipo: "universidad",
      lat: 1.23555,
      lng: -77.29145,
    },
    {
      id: "h-colegio",
      nombre: "Colegio Champagnat",
      corto: "Champagnat",
      tipo: "colegio",
      lat: 1.22905,
      lng: -77.28805,
    },
    {
      id: "h-cristorey",
      nombre: "Iglesia de Cristo Rey",
      corto: "Cristo Rey",
      tipo: "iglesia",
      lat: 1.22195,
      lng: -77.28495,
    },
    {
      id: "h-parqueinfantil",
      nombre: "Parque Infantil",
      corto: "Parque Infantil",
      tipo: "parque",
      lat: 1.21635,
      lng: -77.28215,
    },
    {
      id: "h-plazacarnaval",
      nombre: "Plaza del Carnaval",
      corto: "Plaza del Carnaval",
      tipo: "plaza",
      lat: 1.21475,
      lng: -77.27955,
    },
    {
      id: "h-plazanarino",
      nombre: "Plaza de Nariño",
      corto: "Plaza de Nariño",
      tipo: "plaza",
      lat: 1.21345,
      lng: -77.27835,
    },
    {
      id: "h-unicentro",
      nombre: "Centro Comercial Unicentro",
      corto: "Unicentro",
      tipo: "comercial",
      lat: 1.21105,
      lng: -77.27455,
    },
    {
      id: "h-estadio",
      nombre: "Estadio Libertad",
      corto: "Estadio",
      tipo: "estadio",
      lat: 1.20895,
      lng: -77.27155,
    },
    {
      id: "h-ingenio",
      nombre: "Plaza del Ingenio",
      corto: "Plaza del Ingenio",
      tipo: "plaza",
      lat: 1.20745,
      lng: -77.26975,
    },
  ],
};
