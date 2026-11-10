/**
 * Un solo interruptor decide de dónde salen los datos.
 * `NEXT_PUBLIC_DATOS` es público porque el cliente también necesita saberlo:
 * en modo local se suscribe por SSE, en modo supabase por Realtime.
 *
 * Va en su propio archivo para que los componentes de cliente lo importen sin
 * arrastrar los adaptadores (que son código de servidor) al bundle del celular.
 */
export type ModoDatos = "local" | "supabase";

export const MODO_DATOS: ModoDatos =
  process.env.NEXT_PUBLIC_DATOS === "supabase" ? "supabase" : "local";
