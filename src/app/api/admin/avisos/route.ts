import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin, sinCache } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { validarAviso } from "@/lib/programacion";

export const dynamic = "force-dynamic";

export async function GET() {
  const no = await requiereAdmin();
  if (no) return no;
  try {
    return NextResponse.json({ avisos: await datos().listarAvisos() }, sinCache);
  } catch (e) {
    return errorInterno(e);
  }
}

/** Publica un mensaje para todo el mundo. Sale arriba del mapa al instante. */
export async function POST(req: Request) {
  const no = await requiereAdmin();
  if (no) return no;
  const v = validarAviso(await leerJson(req), `a-${randomUUID().slice(0, 8)}`);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    await datos().guardarAviso(v.aviso);
    return NextResponse.json({ aviso: v.aviso }, { status: 201 });
  } catch (e) {
    return errorInterno(e);
  }
}
