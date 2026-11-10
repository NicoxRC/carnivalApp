import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin, sinCache } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { validarEvento } from "@/lib/programacion";

export const dynamic = "force-dynamic";

export async function GET() {
  const no = await requiereAdmin();
  if (no) return no;
  try {
    return NextResponse.json({ eventos: await datos().listarEventos() }, sinCache);
  } catch (e) {
    return errorInterno(e);
  }
}

export async function POST(req: Request) {
  const no = await requiereAdmin();
  if (no) return no;
  const v = validarEvento(await leerJson(req), `ev-${randomUUID().slice(0, 8)}`);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    await datos().guardarEvento(v.evento);
    return NextResponse.json({ evento: v.evento }, { status: 201 });
  } catch (e) {
    return errorInterno(e);
  }
}
