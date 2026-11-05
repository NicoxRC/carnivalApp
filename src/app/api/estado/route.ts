import { NextResponse } from "next/server";

import { datos, DESFILE_DEMO } from "@/lib/datos";

export const dynamic = "force-dynamic";

/** Snapshot. Es el primer dato que pinta la pantalla y el fallback si el stream se cae. */
export async function GET(req: Request) {
  const desfileId = new URL(req.url).searchParams.get("desfile") ?? DESFILE_DEMO;
  try {
    const estado = await datos().leerEstado(desfileId);
    return NextResponse.json(estado, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
