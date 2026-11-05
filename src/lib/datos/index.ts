import type { AdaptadorDatos } from "@/lib/datos/adaptador";
import { adaptadorLocal } from "@/lib/datos/local";
import { adaptadorSupabase } from "@/lib/datos/supabase";

export { DESFILE_DEMO } from "@/lib/datos/adaptador";
export type { AdaptadorDatos } from "@/lib/datos/adaptador";

/**
 * Un solo interruptor decide de dónde salen los datos.
 * `NEXT_PUBLIC_DATOS` es público porque el cliente también necesita saberlo:
 * en modo local se suscribe por SSE, en modo supabase por Realtime.
 */
export type ModoDatos = "local" | "supabase";

export const MODO_DATOS: ModoDatos =
  process.env.NEXT_PUBLIC_DATOS === "supabase" ? "supabase" : "local";

export function datos(): AdaptadorDatos {
  return MODO_DATOS === "supabase" ? adaptadorSupabase : adaptadorLocal;
}
