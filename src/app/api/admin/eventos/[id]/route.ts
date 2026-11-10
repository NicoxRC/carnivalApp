import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { validarEvento } from "@/lib/programacion";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  const v = validarEvento(await leerJson(req), id);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    await datos().guardarEvento(v.evento);
    return NextResponse.json({ evento: v.evento });
  } catch (e) {
    return errorInterno(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  try {
    await datos().eliminarEvento(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e);
  }
}
