import { NextResponse } from "next/server";

import { errorInterno, requiereAdmin, sinCache } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";

export const dynamic = "force-dynamic";

/** Todas las fotos, con su estado. La cola de moderación son las pendientes. */
export async function GET() {
  const no = await requiereAdmin();
  if (no) return no;
  try {
    return NextResponse.json({ fotos: await datos().listarFotos() }, sinCache);
  } catch (e) {
    return errorInterno(e);
  }
}
