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

/** Solo cuenta quien reportó en los últimos minutos. */
export const VENTANA_DENSIDAD_MS = 5 * 60 * 1000;

/** Cada cuánto reporta el celular su tramo. Poco frecuente: es un dato lento. */
export const INTERVALO_REPORTE_DENSIDAD_MS = 60_000;

/**
 * Por debajo de esto la muestra no representa nada y la capa se apaga entera.
 * Es la salvaguarda contra "el mapa dice vacío donde hay cinco mil personas".
 */
export const MIN_USUARIOS_GLOBAL = 50;

/** Y un tramo necesita al menos esto para clasificarse. */
export const MIN_MUESTRAS_BIN = 3;

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

export function totalBins(): number {
  return Math.ceil(SENDA.longitudMetros / BIN_M);
}

export function binDeMetros(metros: number): number {
  const acotado = Math.min(Math.max(metros, 0), SENDA.longitudMetros - 1);
  return Math.floor(acotado / BIN_M);
}

/**
 * Clasifica cada tramo respecto al más lleno de la ventana.
 * Es relativo a propósito: no sabemos cuánta gente cabe en una cuadra de Pasto,
 * pero sí podemos decir dónde hay más y dónde hay menos.
 */
export function clasificar(conteos: Map<number, number>, total: number): Densidad {
  const servidorTs = Date.now();
  const ventanaMin = Math.round(VENTANA_DENSIDAD_MS / 60000);

  if (total < MIN_USUARIOS_GLOBAL) {
    return { bins: [], total, suficiente: false, ventanaMin, servidorTs };
  }

  let maximo = 0;
  for (const c of conteos.values()) if (c > maximo) maximo = c;
  if (maximo < MIN_MUESTRAS_BIN) {
    return { bins: [], total, suficiente: false, ventanaMin, servidorTs };
  }

  const bins: BinDensidad[] = [];
  for (const [bin, conteo] of conteos) {
    if (conteo < MIN_MUESTRAS_BIN) continue; // sin dato ≠ vacío
    const proporcion = conteo / maximo;
    const nivel: NivelGentio =
      proporcion >= 0.66 ? "lleno" : proporcion >= 0.33 ? "con_gente" : "tranquilo";
    bins.push({
      bin,
      desdeM: bin * BIN_M,
      hastaM: Math.min((bin + 1) * BIN_M, SENDA.longitudMetros),
      conteo,
      nivel,
    });
  }

  bins.sort((a, b) => a.bin - b.bin);
  return { bins, total, suficiente: true, ventanaMin, servidorTs };
}

export const COLOR_NIVEL: Record<NivelGentio, string> = {
  tranquilo: "#0f8f5f",
  con_gente: "#ffc61a",
  lleno: "#c0271b",
};

export const ETIQUETA_NIVEL: Record<NivelGentio, string> = {
  tranquilo: "Hay campo",
  con_gente: "Con gente",
  lleno: "Lleno",
};
