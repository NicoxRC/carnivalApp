/**
 * Los valores que cambian de idioma entre la web y el backend: el espejo en
 * código de las tablas de valores de `docs/backend/GLOSSARY.md`. Si el
 * glosario cambia, se cambia aquí y en ningún otro lado.
 *
 * Cada tabla va de la web al API; la inversa (para leer) se saca de ella, así
 * las dos direcciones no se pueden desincronizar.
 */

import type {
  Aviso,
  CategoriaComercio,
  CategoriaEvento,
  CategoriaServicio,
  EstadoDesfile,
  MomentoPromo,
  PlanComercio,
  Rol,
  TipoMetrica,
} from "@/lib/tipos";

function invertir<K extends string, V extends string>(tabla: Record<K, V>): Readonly<Record<string, K>> {
  return Object.fromEntries(Object.entries(tabla).map(([web, api]) => [api, web])) as Record<string, K>;
}

export type PostApi = "head" | "middle" | "tail";
export const POST_DE_ROL: Readonly<Record<Rol, PostApi>> = { cabeza: "head", mitad: "middle", cola: "tail" };
export const ROL_DE_POST = invertir(POST_DE_ROL);

export const ESTADO_DE_STATE = invertir<EstadoDesfile["estado"], string>({
  programado: "scheduled",
  en_curso: "in_progress",
  finalizado: "finished",
});

export const NIVEL_DE_LEVEL = invertir<Aviso["nivel"], string>({ info: "info", alerta: "alert" });

export const CATEGORIA_DE_EVENTO = invertir<CategoriaEvento, string>({
  presentacion: "stage",
  tasca: "tasca",
  cultural: "cultural",
  infantil: "kids",
});

/** Comercios y servicios comparten el campo `category`. */
export const CATEGORIA_DE_COMERCIO = invertir<CategoriaComercio | CategoriaServicio, string>({
  restaurante: "restaurant",
  tasca: "tasca",
  cafe: "cafe",
  heladeria: "ice_cream",
  panaderia: "bakery",
  tienda: "shop",
  bar: "bar",
  farmacia: "pharmacy",
  bano: "toilet",
  hidratacion: "water",
  salud: "first_aid",
  policia: "police",
  cierre: "road_closure",
});

export const PLAN_DE_API = invertir<PlanComercio, string>({ basico: "basic", destacado: "featured" });

export const MOMENTO_DE_TIMING = invertir<MomentoPromo, string>({
  siempre: "always",
  antes: "before",
  despues: "after",
});

export type TipoMetricaApi = "card" | "map" | "menu" | "whatsapp" | "link" | "offer";
export const TIPO_DE_METRICA: Readonly<Record<TipoMetrica, TipoMetricaApi>> = {
  ficha: "card",
  mapa: "map",
  menu: "menu",
  whatsapp: "whatsapp",
  enlace: "link",
  oferta: "offer",
};
