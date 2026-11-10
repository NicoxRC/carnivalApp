import { NextResponse } from "next/server";

import { errorInterno } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";

export const dynamic = "force-dynamic";

/**
 * Los comercios que ve el público: solo los visibles. Cambian poco, así que
 * se dejan cachear un minuto; el service worker guarda la última copia para
 * que la capa funcione sin red.
 */
export async function GET() {
  try {
    const comercios = (await datos().listarComercios()).filter((c) => c.visible);
    return NextResponse.json(
      { comercios },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } },
    );
  } catch (e) {
    return errorInterno(e);
  }
}
