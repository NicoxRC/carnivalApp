import type { Densidad } from "@/lib/densidad";
import type { EntradaPosicion, EstadoDesfile } from "@/lib/tipos";

/**
 * Una sola interfaz, dos implementaciones:
 *
 *  - `local`    — store en memoria del proceso Next. Sirve para desarrollar y para
 *                 el demo corriendo en la máquina. No sobrevive a un reinicio ni
 *                 funciona en serverless (cada invocación es un proceso distinto).
 *  - `supabase` — el camino de producción. Postgres + Realtime.
 *
 * El punto de que exista esta interfaz es que la ingesta sea IDÉNTICA en los dos:
 * el simulador y un reportero real entran exactamente por la misma puerta.
 */
export interface AdaptadorDatos {
  readonly nombre: "local" | "supabase";
  /** Guarda una posición ya proyectada sobre la senda. */
  registrarPosicion(entrada: EntradaPosicion): Promise<void>;
  /** Snapshot completo para pintar la pantalla. */
  leerEstado(desfileId: string): Promise<EstadoDesfile>;
  /** Marca el desfile como en curso / finalizado. */
  fijarEstadoDesfile(desfileId: string, estado: EstadoDesfile["estado"]): Promise<void>;

  /**
   * Registra que un dispositivo está en un tramo de la senda. Anónimo: se guarda
   * el número de tramo y un id de dispositivo que sirve solo para no contar dos
   * veces a la misma persona. Nunca lat/lng.
   */
  registrarPresencia(desfileId: string, dispositivoId: string, bin: number): Promise<void>;

  /** Gentío agregado por tramo. */
  leerDensidad(desfileId: string): Promise<Densidad>;
}

export const DESFILE_DEMO = "demo";
