import { SENDA } from "@/lib/senda";
import type { MuestraHistorial } from "@/lib/tipos";

export interface PasoPorHito {
  hitoId: string;
  nombre: string;
  metros: number;
  /** Cuándo llegó la cabeza. null si todavía no ha llegado. */
  ts: number | null;
}

/**
 * A qué hora pasó la cabeza por cada punto de referencia.
 *
 * Se toma la primera muestra en que la cabeza ya iba a la altura del hito o más
 * adelante. Es una cota: con un reporte cada 20 s, el error es de segundos, que
 * para "pasó por Cristo Rey a las 10:42" sobra.
 */
export function pasosPorHito(recorrido: MuestraHistorial[]): PasoPorHito[] {
  const orden = [...recorrido].sort((a, b) => a.ts - b.ts);
  return SENDA.hitos.map((h) => {
    const llegada = orden.find((m) => m.metros >= h.metros);
    return { hitoId: h.id, nombre: h.nombre, metros: h.metros, ts: llegada?.ts ?? null };
  });
}
