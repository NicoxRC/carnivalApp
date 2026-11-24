/**
 * Mapa de gentío.
 *
 * La senda es 1D, así que el gentío también: se cuenta por tramos de 100 m a lo
 * largo del recorrido, no por coordenadas. Eso tiene dos ventajas: encaja con el
 * resto del modelo, y lo que se guarda del usuario es un número de tramo, no su
 * posición.
 *
 * El problema real de esta función no es pintarla, es no mentir:
 *
 *  - Con pocos usuarios, "0 personas en este tramo" significa "0 usuarios de la
 *    app", que el 31 de diciembre a las 9 de la mañana es todo el mapa. Por eso
 *    hay un umbral global: por debajo de MIN_USUARIOS_GLOBAL la app dice
 *    "todavía no hay datos suficientes" en vez de pintar la senda vacía.
 *  - Un tramo sin muestras no se pinta de "tranquilo": se deja sin dato. No es
 *    lo mismo saber que está vacío que no saber nada.
 */

import { SENDA } from "@/lib/senda";

/** Tamaño del tramo. 100 m ≈ una cuadra: suficiente para decidir dónde pararse. */
export const BIN_M = 100;

/** Cada cuánto reporta el celular su tramo. Poco frecuente: es un dato lento. */
export const INTERVALO_REPORTE_DENSIDAD_MS = 60_000;

/**
 * Por debajo de esto la muestra no representa nada y la capa se apaga entera.
 * Es la salvaguarda contra "el mapa dice vacío donde hay cinco mil personas".
 */
export const MIN_USUARIOS_GLOBAL = 50;

export type NivelGentio = "tranquilo" | "con_gente" | "lleno";

export interface BinDensidad {
  bin: number;
  desdeM: number;
  hastaM: number;
  conteo: number;
  nivel: NivelGentio;
}

export interface Densidad {
  /** Solo los tramos con muestras suficientes. Los demás no existen a propósito. */
  bins: BinDensidad[];
  /** Usuarios distintos que reportaron en la ventana. */
  total: number;
  /** false = no hay muestra para decir nada, y la UI debe decirlo así. */
  suficiente: boolean;
  ventanaMin: number;
  servidorTs: number;
}

export function binDeMetros(metros: number): number {
  const acotado = Math.min(Math.max(metros, 0), SENDA.longitudMetros - 1);
  return Math.floor(acotado / BIN_M);
}

export const COLOR_NIVEL: Record<NivelGentio, string> = {
  tranquilo: "#0f8f5f",
  con_gente: "#ffc61a",
  lleno: "#c0271b",
};
