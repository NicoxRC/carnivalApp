import type { Densidad } from "@/lib/densidad";
import type {
  Aviso,
  Comercio,
  Desfile,
  EntradaPosicion,
  EstadoDesfile,
  Evento,
  Foto,
  MuestraHistorial,
  Reportero,
  Rol,
  SuscripcionAviso,
  TipoMetrica,
} from "@/lib/tipos";

/**
 * Una sola interfaz, dos implementaciones:
 *
 *  - `local`    — store en memoria del proceso Next, con copia en disco de lo que
 *                 se edita desde el panel. Sirve para desarrollar y para el demo
 *                 corriendo en una máquina. No funciona en serverless (cada
 *                 invocación es un proceso distinto).
 *  - `supabase` — el camino de producción. Postgres + Realtime + Storage.
 *
 * El punto de que exista esta interfaz es que la ingesta sea IDÉNTICA en los dos:
 * el simulador y un reportero real entran exactamente por la misma puerta.
 */
export interface AdaptadorDatos {
  readonly nombre: "local" | "supabase";

  /* ---- El desfile en vivo ---- */

  /**
   * Guarda posiciones ya validadas, todas del mismo desfile. `reporteroId` es
   * quién las mandó, si vinieron del panel de reporteros.
   */
  registrarPosiciones(entradas: EntradaPosicion[], reporteroId?: string): Promise<void>;
  /** Snapshot completo para pintar la pantalla. null si el desfile no existe. */
  leerEstado(desfileId: string): Promise<EstadoDesfile | null>;
  /** Marca el desfile como en curso / finalizado. «programado» borra sus posiciones. */
  fijarEstadoDesfile(desfileId: string, estado: EstadoDesfile["estado"]): Promise<void>;
  /** Quién mandó la última posición de un rol. Para el relevo entre reporteros. */
  ultimoEmisor(desfileId: string, rol: Rol): Promise<{ reporteroId: string | null; ts: number } | null>;
  /** Todo el recorrido de la cabeza, para saber a qué hora pasó por cada punto. */
  leerRecorrido(desfileId: string): Promise<MuestraHistorial[]>;

  /* ---- Gentío ---- */

  /**
   * Registra que un dispositivo está en un tramo de la senda. Anónimo: se guarda
   * el número de tramo y un id de dispositivo que sirve solo para no contar dos
   * veces a la misma persona. Nunca lat/lng.
   */
  registrarPresencia(desfileId: string, dispositivoId: string, bin: number): Promise<void>;
  /** Gentío agregado por tramo. */
  leerDensidad(desfileId: string): Promise<Densidad>;

  /* ---- Programación: desfiles y eventos ---- */

  listarDesfiles(): Promise<Desfile[]>;
  /** Crea o actualiza nombre, fecha y hora. El estado se cambia con fijarEstadoDesfile. */
  guardarDesfile(d: Omit<Desfile, "estado">): Promise<void>;
  eliminarDesfile(id: string): Promise<void>;

  listarEventos(): Promise<Evento[]>;
  guardarEvento(e: Evento): Promise<void>;
  eliminarEvento(id: string): Promise<void>;

  /* ---- Avisos a todos los usuarios ---- */

  /** Solo los vigentes. */
  listarAvisos(): Promise<Aviso[]>;
  guardarAviso(a: Aviso): Promise<void>;
  eliminarAviso(id: string): Promise<void>;

  /* ---- Comercios y servicios: los gestiona el panel de administración ---- */

  /** Todos, incluidos los ocultos. El público filtra por `visible`. */
  listarComercios(): Promise<Comercio[]>;
  /** Crea o reemplaza por `id`. */
  guardarComercio(comercio: Comercio): Promise<void>;
  eliminarComercio(id: string): Promise<void>;
  /** Suma 1 a un contador del comercio (vistas de ficha, toques en WhatsApp…). */
  sumarMetrica(comercioId: string, tipo: TipoMetrica): Promise<void>;
  /** comercioId → tipo → total. */
  leerMetricas(): Promise<Record<string, Partial<Record<TipoMetrica, number>>>>;

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

  /* ---- Avisos push "el desfile está cerca" ---- */

  /** Una por dispositivo (endpoint): volver a suscribirse reemplaza la anterior. */
  guardarSuscripcion(s: SuscripcionAviso): Promise<void>;
  listarSuscripciones(desfileId: string): Promise<SuscripcionAviso[]>;
  eliminarSuscripcion(endpoint: string): Promise<void>;

  /* ---- Fotos del público ---- */

  /** Guarda la imagen (JPEG ya reducido por el cliente) como pendiente de moderación. */
  crearFoto(datos: { desfileId: string | null; metros: number | null }, jpeg: Buffer): Promise<Foto>;
  listarFotos(estado?: Foto["estado"]): Promise<Foto[]>;
  moderarFoto(id: string, estado: Foto["estado"]): Promise<void>;
  eliminarFoto(id: string): Promise<void>;
  /** Los bytes de una foto, si este adaptador los sirve él mismo (el local). */
  leerArchivoFoto(id: string): Promise<{ jpeg: Buffer; estado: Foto["estado"] } | null>;
}
