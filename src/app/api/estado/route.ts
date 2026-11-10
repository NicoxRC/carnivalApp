import { NextResponse } from "next/server";

import { errorInterno } from "@/lib/api/respuestas";
import { datos, MODO_DATOS, resolverDesfile } from "@/lib/datos";

export const dynamic = "force-dynamic";

/**
 * Snapshot. Es el primer dato que pinta la pantalla y el fallback si el stream
 * se cae. Sin `?desfile=` devuelve el desfile actual (ver `src/lib/desfiles.ts`).
 */
export async function GET(req: Request) {
  try {
    const desfile = await resolverDesfile(new URL(req.url).searchParams.get("desfile"));
    const estado = desfile ? await datos().leerEstado(desfile.id) : null;
    if (!estado) return NextResponse.json({ error: "No hay desfile." }, { status: 404 });
    return NextResponse.json(estado, {
      headers: {
        // En producción cada posición nueva hace que todos los celulares pidan
        // esto a la vez. Dos segundos de caché en el borde convierten miles de
        // lecturas de la base en una.
        "Cache-Control":
          MODO_DATOS === "supabase" ? "public, s-maxage=2, stale-while-revalidate=5" : "no-store",
      },
    });
  } catch (e) {
    return errorInterno(e);
  }
}
