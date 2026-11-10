import { NextResponse } from "next/server";

import { errorInterno } from "@/lib/api/respuestas";
import { datos, resolverDesfile } from "@/lib/datos";
import { pasosPorHito } from "@/lib/recorrido";

export const dynamic = "force-dynamic";

/** A qué hora pasó la cabeza por cada punto de referencia. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const desfile = await resolverDesfile((await params).id);
    if (!desfile) return NextResponse.json({ error: "Ese desfile no existe." }, { status: 404 });
    const pasos = pasosPorHito(await datos().leerRecorrido(desfile.id));
    return NextResponse.json(
      { desfile, pasos },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
    );
  } catch (e) {
    return errorInterno(e);
  }
}
