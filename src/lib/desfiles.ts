import type { Desfile } from "@/lib/tipos";

/**
 * Cuál es el desfile que la app sigue ahora.
 *
 * El Carnaval tiene un desfile por día. La app no le pregunta al usuario cuál
 * quiere ver: muestra el que está pasando, o el siguiente.
 *
 *  1. El que esté en curso (si hay varios, el más reciente).
 *  2. El programado para hoy.
 *  3. El próximo programado.
 *  4. El último que hubo (para ver cómo terminó).
 */
export function desfileActual(desfiles: Desfile[], hoy: string): Desfile | null {
  if (desfiles.length === 0) return null;
  const orden = [...desfiles].sort((a, b) =>
    (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio),
  );
  const enCurso = orden.filter((d) => d.estado === "en_curso");
  if (enCurso.length > 0) return enCurso[enCurso.length - 1];
  const deHoy = orden.find((d) => d.fecha === hoy && d.estado === "programado");
  if (deHoy) return deHoy;
  const proximo = orden.find((d) => d.fecha > hoy && d.estado === "programado");
  if (proximo) return proximo;
  const pasados = orden.filter((d) => d.fecha <= hoy);
  return pasados[pasados.length - 1] ?? orden[0];
}
