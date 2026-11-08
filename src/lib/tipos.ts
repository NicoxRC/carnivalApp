import type { Feature, LineString } from "geojson";

/** Los tres puntos que reportan posición. La senda es 1D: cada uno es un número de metros. */
export type Rol = "cabeza" | "mitad" | "cola";

export const ROLES: Rol[] = ["cabeza", "mitad", "cola"];

export interface Senda {
  id: string;
  nombre: string;
  oficial: boolean;
  advertencia?: string;
  geojson: Feature<LineString>;
  /** Longitud total del recorrido, en metros. Calculada al cargar. */
  longitudMetros: number;
  hitos: Hito[];
}

/**
 * Tipos de referencia. La gente no se ubica por "carrera 27 con calle 18":
 * se ubica por la iglesia, el centro comercial, el colegio. El nombre de la
 * calle es un dato de catastro; el hito es lo que se ve desde la acera.
 */
export type TipoHito =
  | "iglesia"
  | "comercial"
  | "colegio"
  | "universidad"
  | "plaza"
  | "parque"
  | "estadio"
  | "hospital";

export interface Hito {
  id: string;
  nombre: string;
  /** Nombre corto para el mapa, donde no cabe el largo. */
  corto: string;
  tipo: TipoHito;
  lat: number;
  lng: number;
  /** Metros desde el inicio de la senda. Se calcula proyectando lat/lng. */
  metros: number;
  /** A qué distancia de la senda está. Un hito muy lejos no sirve de referencia. */
  desvioM: number;
}

/** Lo que envía un reportero (o el simulador). Payload mínimo a propósito. */
export interface EntradaPosicion {
  desfileId: string;
  rol: Rol;
  lat: number;
  lng: number;
  precisionM?: number | null;
  /** epoch ms. Si falta, el servidor usa su propio reloj. */
  ts?: number;
}

/** Una posición ya proyectada sobre la senda. */
export interface Posicion {
  rol: Rol;
  lat: number;
  lng: number;
  /** Metros recorridos desde el inicio de la senda. El único número que importa. */
  metros: number;
  precisionM: number | null;
  ts: number;
}

export interface MuestraHistorial {
  metros: number;
  ts: number;
}

/** El snapshot completo que consume la UI. */
export interface EstadoDesfile {
  desfileId: string;
  nombre: string;
  estado: "programado" | "en_curso" | "finalizado";
  sendaId: string;
  posiciones: Partial<Record<Rol, Posicion>>;
  /** Últimos ~10 min de la cabeza, para estimar velocidad. */
  historialCabeza: MuestraHistorial[];
  /** Reloj del servidor, para calcular "hace X min" sin depender del reloj del celular. */
  servidorTs: number;
}

/** Un reportero lleva más de esto sin reportar => "sin señal". */
export const MS_SIN_SENAL = 5 * 60 * 1000;

/** Ventana que se promedia para estimar la velocidad de la cabeza. */
export const MS_VENTANA_VELOCIDAD = 10 * 60 * 1000;

/**
 * Cuánto historial se guarda y se manda. Más largo que la ventana de velocidad
 * porque para afirmar "lleva más de 10 minutos detenido" hay que poder ver
 * más de 10 minutos hacia atrás.
 */
export const MS_VENTANA_HISTORIAL = 16 * 60 * 1000;

/** Sin avanzar más que esto durante DETENIDO_MS => se declara detenido. */
export const AVANCE_MINIMO_M = 25;

/** Umbral duro: recién aquí se dice "el desfile está detenido". */
export const DETENIDO_MS = 10 * 60 * 1000;

/** Umbral suave: antes del anterior, se avisa sin dramatizar ("sin avanzar hace 4 min"). */
export const SIN_AVANZAR_AVISO_MS = 3 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Comercios (la capa del mapa y lo que se vende como pauta)                  */
/* -------------------------------------------------------------------------- */

export type CategoriaComercio =
  | "restaurante"
  | "tasca"
  | "cafe"
  | "heladeria"
  | "panaderia"
  | "tienda"
  | "bar"
  | "farmacia";

/** null = aparece en el directorio sin haber pagado. Aparecer nunca depende de pagar. */
export type PlanComercio = "basico" | "destacado";

export interface Comercio {
  id: string;
  nombre: string;
  categoria: CategoriaComercio;
  descripcion: string;
  /** Referencia para encontrarlo desde la acera, no solo la dirección catastral. */
  direccion: string;
  horario: string;
  lat: number;
  lng: number;
  plan: PlanComercio | null;
  /** La oferta. Solo se muestra si hay plan: es lo que se vende. */
  promo: string | null;
  /** false = oculto del mapa sin borrarlo (p. ej. no renovó, o cerró ese día). */
  visible: boolean;
}

/* -------------------------------------------------------------------------- */
/* Reporteros                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Una persona del equipo que camina con el desfile. Entra al panel con un
 * código que le da el administrador; nunca ve ni toca nada más.
 */
export interface Reportero {
  id: string;
  nombre: string;
  rol: Rol;
  /** false = el código deja de servir, sin borrar su historial. */
  activo: boolean;
  /** Última vez que mandó una posición. null si nunca. */
  ultimaSenalTs: number | null;
  creadoEn: number;
}
