import type { AdaptadorDatos } from "@/lib/datos/adaptador";
import { adaptadorLocal } from "@/lib/datos/local";
import { MODO_DATOS } from "@/lib/datos/modo";
import { adaptadorSupabase } from "@/lib/datos/supabase";

export { DESFILE_DEMO } from "@/lib/datos/adaptador";
export type { AdaptadorDatos } from "@/lib/datos/adaptador";
export { MODO_DATOS, type ModoDatos } from "@/lib/datos/modo";

/** Solo servidor. Desde el cliente, importar `@/lib/datos/modo`. */
export function datos(): AdaptadorDatos {
  return MODO_DATOS === "supabase" ? adaptadorSupabase : adaptadorLocal;
}
