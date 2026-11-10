import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin, sinCache } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { desfileActual } from "@/lib/desfiles";
import { hoyEnPasto } from "@/lib/fecha";
import { validarDesfile } from "@/lib/programacion";

export const dynamic = "force-dynamic";

export async function GET() {
  const no = await requiereAdmin();
  if (no) return no;
  try {
    const desfiles = await datos().listarDesfiles();
    return NextResponse.json({ desfiles, actualId: desfileActual(desfiles, hoyEnPasto())?.id ?? null }, sinCache);
  } catch (e) {
    return errorInterno(e);
  }
}

export async function POST(req: Request) {
  const no = await requiereAdmin();
  if (no) return no;
  const v = validarDesfile(await leerJson(req), `d-${randomUUID().slice(0, 8)}`);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    await datos().guardarDesfile(v.desfile);
    return NextResponse.json({ desfile: v.desfile }, { status: 201 });
  } catch (e) {
    return errorInterno(e);
  }
}
