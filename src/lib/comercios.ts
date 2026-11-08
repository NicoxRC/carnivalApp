import type { CategoriaComercio, Comercio, PlanComercio } from "@/lib/tipos";

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

export const PLANES_COMERCIO: Record<PlanComercio, string> = {
  basico: "Básico",
  destacado: "Destacado",
};

const LARGO_MAX = { nombre: 80, descripcion: 280, direccion: 140, horario: 80, promo: 140 };

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Valida lo que manda el panel de administración. Devuelve el comercio limpio
 * o el primer error, con un mensaje que se puede mostrar tal cual.
 */
export function validarComercio(
  cuerpo: unknown,
  id: string,
): { comercio: Comercio } | { error: string } {
  if (typeof cuerpo !== "object" || cuerpo === null) return { error: "Datos inválidos." };
  const o = cuerpo as Record<string, unknown>;

  const nombre = texto(o.nombre, LARGO_MAX.nombre);
  if (!nombre) return { error: "Falta el nombre." };

  const categoria = o.categoria as CategoriaComercio;
  if (!(categoria in CATEGORIAS_COMERCIO)) return { error: "Categoría inválida." };

  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Falta marcar el comercio en el mapa." };
  }

  const plan = o.plan === "basico" || o.plan === "destacado" ? o.plan : null;
  // Sin plan no hay oferta: la promo es justamente lo que se vende.
  const promo = plan ? texto(o.promo, LARGO_MAX.promo) || null : null;

  return {
    comercio: {
      id,
      nombre,
      categoria,
      descripcion: texto(o.descripcion, LARGO_MAX.descripcion),
      direccion: texto(o.direccion, LARGO_MAX.direccion),
      horario: texto(o.horario, LARGO_MAX.horario),
      lat,
      lng,
      plan,
      promo,
      visible: o.visible !== false,
    },
  };
}
