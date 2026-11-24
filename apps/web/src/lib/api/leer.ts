/**
 * Validadores de forma para lo que llega del backend. Cada traductor de
 * `src/lib/api/` los usa para no dejar pasar a las pantallas un campo que no
 * vino o un valor que no conoce: mejor un error claro aquí que algo raro
 * pintado en el mapa.
 */

export type Objeto = Record<string, unknown>;

function invalido(detalle: string): Error {
  return new Error(`Respuesta del API inválida: ${detalle}.`);
}

export function objeto(v: unknown, campo: string): Objeto {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Objeto;
  throw invalido(`${campo} no es un objeto`);
}

export function lista(v: unknown, campo: string): unknown[] {
  if (Array.isArray(v)) return v;
  throw invalido(`${campo} no es una lista`);
}

export function texto(o: Objeto, campo: string): string {
  const v = o[campo];
  if (typeof v === "string") return v;
  throw invalido(`falta ${campo}`);
}

export function textoONulo(o: Objeto, campo: string): string | null {
  const v = o[campo];
  if (v === null || v === undefined) return null;
  return texto(o, campo);
}

export function numero(o: Objeto, campo: string): number {
  const v = o[campo];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  throw invalido(`falta ${campo}`);
}

export function numeroONulo(o: Objeto, campo: string): number | null {
  const v = o[campo];
  if (v === null || v === undefined) return null;
  return numero(o, campo);
}

export function booleano(o: Objeto, campo: string): boolean {
  const v = o[campo];
  if (typeof v === "boolean") return v;
  throw invalido(`falta ${campo}`);
}

export function deTabla<T>(tabla: Readonly<Record<string, T>>, valor: string, campo: string): T {
  const traducido = Object.hasOwn(tabla, valor) ? tabla[valor] : undefined;
  if (traducido === undefined) throw invalido(`${campo} «${valor}» desconocido`);
  return traducido;
}

/**
 * Traduce cada elemento de una lista y descarta, avisando en la consola, el
 * que no se puede traducir. Para listas de cosas independientes (comercios,
 * eventos): un comercio con una categoría nueva no debe tumbar toda la capa.
 */
export function sinLosInvalidos<T>(items: unknown[], traducir: (v: unknown) => T, que: string): T[] {
  const traducidos: T[] = [];
  for (const item of items) {
    try {
      traducidos.push(traducir(item));
    } catch (error) {
      console.warn(`Se descarta ${que}:`, error instanceof Error ? error.message : error, item);
    }
  }
  return traducidos;
}
