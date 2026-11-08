import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin, sinCache } from "@/lib/api/respuestas";
import { validarComercio } from "@/lib/comercios";
import { datos } from "@/lib/datos";

export const dynamic = "force-dynamic";

/** Todos los comercios, ocultos incluidos. */
export async function GET() {
  const no = await requiereAdmin();
  if (no) return no;
  try {
    return NextResponse.json({ comercios: await datos().listarComercios() }, sinCache);
  } catch (e) {
    return errorInterno(e);
  }
}

export async function POST(req: Request) {
  const no = await requiereAdmin();
  if (no) return no;
  const v = validarComercio(await leerJson(req), `c-${randomUUID().slice(0, 8)}`);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    await datos().guardarComercio(v.comercio);
    return NextResponse.json({ comercio: v.comercio }, { status: 201 });
  } catch (e) {
    return errorInterno(e);
  }
}
