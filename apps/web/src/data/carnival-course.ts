import type { Feature, LineString } from "geojson";

export interface CourseDefinition {
  id: string;
  name: string;
  official: boolean;
  warning?: string;
  city: string;
  geojson: Feature<LineString>;
  waypoints: RawWaypoint[];
}

export interface RawWaypoint {
  id: string;
  name: string;
  short: string;
  kind:
    | "church"
    | "mall"
    | "school"
    | "university"
    | "square"
    | "park"
    | "stadium"
    | "hospital";
  lat: number;
  lng: number;
}

const coordinates: [number, number][] = [
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

export const COURSE_DEFINITION: CourseDefinition = {
  id: "provisional-pasto-course",
  name: "Senda del Carnaval (trazado provisional)",
  official: false,
  warning:
    "Trazado aproximado para desarrollo. Reemplazar por el recorrido oficial de Corpocarnaval.",
  city: "San Juan de Pasto, Nariño, Colombia",
  geojson: {
    type: "Feature",
    properties: { name: "Senda del Carnaval (provisional)" },
    geometry: { type: "LineString", coordinates: coordinates },
  },
  waypoints: [
    {
      id: "w-udenar",
      name: "Universidad de Nariño",
      short: "U. de Nariño",
      kind: "university",
      lat: 1.23555,
      lng: -77.29145,
    },
    {
      id: "w-colegio",
      name: "Colegio Champagnat",
      short: "Champagnat",
      kind: "school",
      lat: 1.22905,
      lng: -77.28805,
    },
    {
      id: "w-cristorey",
      name: "Iglesia de Cristo Rey",
      short: "Cristo Rey",
      kind: "church",
      lat: 1.22195,
      lng: -77.28495,
    },
    {
      id: "w-parqueinfantil",
      name: "Parque Infantil",
      short: "Parque Infantil",
      kind: "park",
      lat: 1.21635,
      lng: -77.28215,
    },
    {
      id: "w-plazacarnaval",
      name: "Plaza del Carnaval",
      short: "Plaza del Carnaval",
      kind: "square",
      lat: 1.21475,
      lng: -77.27955,
    },
    {
      id: "w-plazanarino",
      name: "Plaza de Nariño",
      short: "Plaza de Nariño",
      kind: "square",
      lat: 1.21345,
      lng: -77.27835,
    },
    {
      id: "w-unicentro",
      name: "Centro Comercial Unicentro",
      short: "Unicentro",
      kind: "mall",
      lat: 1.21105,
      lng: -77.27455,
    },
    {
      id: "w-estadio",
      name: "Estadio Libertad",
      short: "Estadio",
      kind: "stadium",
      lat: 1.20895,
      lng: -77.27155,
    },
    {
      id: "w-ingenio",
      name: "Plaza del Ingenio",
      short: "Plaza del Ingenio",
      kind: "square",
      lat: 1.20745,
      lng: -77.26975,
    },
  ],
};
