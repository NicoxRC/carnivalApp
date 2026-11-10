import { NextResponse } from "next/server";

import { errorInterno } from "@/lib/api/respuestas";
import { datos, listarDesfilesCacheado } from "@/lib/datos";
import { desfileActual } from "@/lib/desfiles";
import { hoyEnPasto } from "@/lib/fecha";

export const dynamic = "force-dynamic";

/**
 * Toda la programación: los desfiles de cada día y los demás eventos.
 * `hoy` viaja desde el servidor, en hora de Pasto, para que un celular con la
 * fecha o la zona mal puestas no marque otro día.
 */
export async function GET() {
  try {
    const [desfiles, eventos] = await Promise.all([listarDesfilesCacheado(), datos().listarEventos()]);
    const hoy = hoyEnPasto();
    return NextResponse.json(
      { desfiles, eventos, hoy, actualId: desfileActual(desfiles, hoy)?.id ?? null },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" } },
    );
  } catch (e) {
    return errorInterno(e);
  }
}
