export interface PasoPorHito {
  hitoId: string;
  nombre: string;
  metros: number;
  /** Cuándo llegó la cabeza. null si todavía no ha llegado. */
  ts: number | null;
}
