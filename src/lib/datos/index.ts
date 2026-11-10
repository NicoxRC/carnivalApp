import type { AdaptadorDatos } from "@/lib/datos/adaptador";
import { adaptadorLocal } from "@/lib/datos/local";
import { MODO_DATOS } from "@/lib/datos/modo";
import { adaptadorSupabase } from "@/lib/datos/supabase";
import { desfileActual } from "@/lib/desfiles";
import { hoyEnPasto } from "@/lib/fecha";
import type { Desfile } from "@/lib/tipos";

export type { AdaptadorDatos } from "@/lib/datos/adaptador";
export { MODO_DATOS, type ModoDatos } from "@/lib/datos/modo";

/** Solo servidor. Desde el cliente, importar `@/lib/datos/modo`. */
export function datos(): AdaptadorDatos {
  return MODO_DATOS === "supabase" ? adaptadorSupabase : adaptadorLocal;
}

/**
 * La lista de desfiles se consulta en casi todas las peticiones (para saber
 * cuál es el actual) y cambia un par de veces al día. Se guarda dos segundos:
 * suficiente para que mil celulares pidiendo a la vez cuesten una consulta.
 */
let cache: { hasta: number; lista: Promise<Desfile[]> } | null = null;

export function listarDesfilesCacheado(): Promise<Desfile[]> {
  if (MODO_DATOS === "local") return datos().listarDesfiles(); // memoria: ya es instantáneo
  if (!cache || cache.hasta < Date.now()) {
    cache = { hasta: Date.now() + 2000, lista: datos().listarDesfiles() };
    cache.lista.catch(() => (cache = null));
  }
  return cache.lista;
}

/**
 * Resuelve de qué desfile se habla. Con `id`, ese (o null si no existe: nunca
 * se crea un desfile por pedirlo). Sin `id`, el actual.
 */
export async function resolverDesfile(id?: string | null): Promise<Desfile | null> {
  const lista = await listarDesfilesCacheado();
  if (id) return lista.find((d) => d.id === id) ?? null;
  return desfileActual(lista, hoyEnPasto());
}
