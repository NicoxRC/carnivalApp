import type { Densidad } from "@/lib/densidad";
import type { Comercio, EntradaPosicion, EstadoDesfile, Reportero, Rol } from "@/lib/tipos";

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
  /**
   * Guarda una posición ya proyectada sobre la senda. `reporteroId` es quién la
   * mandó, si vino del panel de reporteros (el simulador no tiene).
   */
  registrarPosicion(entrada: EntradaPosicion, reporteroId?: string): Promise<void>;
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

  /* ---- Comercios: los gestiona el panel de administración ---- */

  /** Todos, incluidos los ocultos. El público filtra por `visible`. */
  listarComercios(): Promise<Comercio[]>;
  /** Crea o reemplaza por `id`. */
  guardarComercio(comercio: Comercio): Promise<void>;
  eliminarComercio(id: string): Promise<void>;

  /* ---- Reporteros ---- */

  listarReporteros(): Promise<Reportero[]>;
  leerReportero(id: string): Promise<Reportero | null>;
  /** Solo encuentra reporteros activos. */
  buscarReporteroPorCodigo(codigoHash: string): Promise<Reportero | null>;
  crearReportero(datos: { nombre: string; rol: Rol }, codigoHash: string): Promise<Reportero>;
  actualizarReportero(
    id: string,
    cambios: { nombre?: string; rol?: Rol; activo?: boolean; codigoHash?: string },
  ): Promise<Reportero | null>;
  eliminarReportero(id: string): Promise<void>;
}

export const DESFILE_DEMO = "demo";
