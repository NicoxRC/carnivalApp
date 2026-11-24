import type {
  CategoriaComercio,
  CategoriaServicio,
  MomentoPromo,
  PlanComercio,
} from "@/lib/tipos";

/** Nombre para mostrar de cada categoría. El orden es el de los selectores. */
export const CATEGORIAS_COMERCIO: Record<CategoriaComercio, string> = {
  restaurante: "Restaurante",
  tasca: "Tasca",
  cafe: "Café",
  heladeria: "Heladería",
  panaderia: "Panadería",
  tienda: "Tienda",
  bar: "Bar",
  farmacia: "Droguería",
};

/**
 * Servicios. ⚠️ Solo con datos oficiales: un baño inventado en un mapa que
 * alguien usa para buscar un baño es peor que no ofrecer la capa.
 */
export const CATEGORIAS_SERVICIO: Record<CategoriaServicio, string> = {
  bano: "Baños",
  hidratacion: "Punto de hidratación",
  salud: "Primeros auxilios",
  policia: "Policía",
  cierre: "Cierre vial",
};

export function esServicio(categoria: string): categoria is CategoriaServicio {
  return categoria in CATEGORIAS_SERVICIO;
}

export function nombreCategoria(categoria: string): string {
  return (
    (CATEGORIAS_COMERCIO as Record<string, string>)[categoria] ??
    (CATEGORIAS_SERVICIO as Record<string, string>)[categoria] ??
    "Sitio"
  );
}

export const PLANES_COMERCIO: Record<PlanComercio, string> = {
  basico: "Básico",
  destacado: "Destacado",
};

export const MOMENTOS_PROMO: Record<MomentoPromo, string> = {
  siempre: "Todo el día",
  antes: "Solo antes de que pase el desfile",
  despues: "Solo después de que pase el desfile",
};
