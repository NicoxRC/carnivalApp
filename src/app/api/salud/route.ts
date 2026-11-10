import { NextResponse } from "next/server";

import { datos, MODO_DATOS } from "@/lib/datos";

export const dynamic = "force-dynamic";

/** Para un monitor externo: ¿el servidor responde y llega a sus datos? */
export async function GET() {
  try {
    const desfiles = await datos().listarDesfiles();
    return NextResponse.json({ ok: true, modo: MODO_DATOS, desfiles: desfiles.length, hora: Date.now() });
  } catch {
    return NextResponse.json({ ok: false, modo: MODO_DATOS }, { status: 503 });
  }
}
