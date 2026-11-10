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
  /** YYYY-MM-DD, en hora de Pasto. */
  fecha: string;
  /** HH:MM */
  horaInicio: string;
  sendaId: string;
  posiciones: Partial<Record<Rol, Posicion>>;
  /** Últimos ~10 min de la cabeza, para estimar velocidad. */
  historialCabeza: MuestraHistorial[];
  /** Mensajes del equipo para todo el mundo ("arranca con 40 min de retraso"). */
  avisos: Aviso[];
  /** Reloj del servidor, para calcular "hace X min" sin depender del reloj del celular. */
  servidorTs: number;
}

/**
 * Un desfile programado. El Carnaval tiene varios, uno por día: en cada momento
 * hay uno «actual» (ver `src/lib/desfiles.ts`), que es el que sigue la app.
 */
export interface Desfile {
  id: string;
  nombre: string;
  /** YYYY-MM-DD, en hora de Pasto. */
  fecha: string;
  /** HH:MM */
  horaInicio: string;
  estado: EstadoDesfile["estado"];
}

export type CategoriaEvento = "tasca" | "presentacion" | "cultural" | "infantil";

/** Un evento de la programación que no es un desfile: una tarima, una tasca. */
export interface Evento {
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string | null;
  titulo: string;
  descripcion: string;
  categoria: CategoriaEvento;
  lugarNombre: string;
  /** null = sin punto en el mapa ("toda la ciudad"). */
  lat: number | null;
  lng: number | null;
  patrocinado: boolean;
}

/** Mensaje del equipo a todos los usuarios. Sale arriba del mapa. */
export interface Aviso {
  id: string;
  texto: string;
  nivel: "info" | "alerta";
  creadoEn: number;
  /** null = hasta que el admin lo quite. */
  expiraEn: number | null;
}

/** Con un GPS peor que esto, el punto puede caer a cuadras de la senda: se descarta. */
export const PRECISION_MAX_M = 150;

/**
 * Relevo entre reporteros del mismo rol. Mientras el titular siga mandando,
 * los puntos de otro reportero de ese rol se ignoran; si el titular se calla
 * más que esto, el siguiente que mande toma el rol.
 */
export const RELEVO_MS = 60 * 1000;

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

/**
 * Servicios: baños, agua, primeros auxilios. Comparten almacén y formulario con
 * los comercios (son puntos en el mapa), pero van en su propia capa, nunca
 * llevan plan ni oferta, y solo deben cargarse con datos oficiales.
 */
export type CategoriaServicio = "bano" | "hidratacion" | "salud" | "policia" | "cierre";

export interface ItemMenu {
  nombre: string;
  /** Texto libre: "$8.000", "desde $5.000". */
  precio: string;
}

/** Cuándo se muestra la oferta respecto al paso del desfile por el comercio. */
export type MomentoPromo = "siempre" | "antes" | "despues";

/** Lo que se le cuenta al anunciante. */
export type TipoMetrica = "ficha" | "mapa" | "menu" | "whatsapp" | "enlace" | "oferta";
export const TIPOS_METRICA: TipoMetrica[] = ["ficha", "mapa", "menu", "whatsapp", "enlace", "oferta"];

/** null = aparece en el directorio sin haber pagado. Aparecer nunca depende de pagar. */
export type PlanComercio = "basico" | "destacado";

export interface Comercio {
  id: string;
  nombre: string;
  categoria: CategoriaComercio | CategoriaServicio;
  descripcion: string;
  /** Referencia para encontrarlo desde la acera, no solo la dirección catastral. */
  direccion: string;
  horario: string;
  lat: number;
  lng: number;
  plan: PlanComercio | null;
  /** La oferta. Solo se muestra si hay plan: es lo que se vende. */
  promo: string | null;
  /** Con "antes"/"despues", la oferta solo sale antes o después de que pase el desfile. */
  promoMomento: MomentoPromo;
  /** Lista de productos. Solo se muestra con plan. */
  menu: ItemMenu[];
  /** Solo dígitos, con indicativo: "573001234567". Solo se muestra con plan. */
  whatsapp: string | null;
  /** Instagram o página del comercio. Solo se muestra con plan. */
  enlace: string | null;
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

/* -------------------------------------------------------------------------- */
/* Fotos del público                                                          */
/* -------------------------------------------------------------------------- */

export interface Foto {
  id: string;
  desfileId: string | null;
  /** Tramo de la senda donde se tomó, si quien la subió compartió ubicación. */
  metros: number | null;
  /** Nada se publica sin pasar por moderación. */
  estado: "pendiente" | "aprobada" | "rechazada";
  creadoEn: number;
  url: string;
}

/* -------------------------------------------------------------------------- */
/* Avisos "el desfile está cerca"                                             */
/* -------------------------------------------------------------------------- */

/** Una suscripción push: a quién avisar y cuándo. Sin datos personales. */
export interface SuscripcionAviso {
  endpoint: string;
  p256dh: string;
  auth: string;
  desfileId: string;
  /** Dónde espera, en metros sobre la senda. */
  metros: number;
  /** Avisar cuando falten estos minutos o menos. */
  umbralMin: number;
}
