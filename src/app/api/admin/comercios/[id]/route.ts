import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin } from "@/lib/api/respuestas";
import { validarComercio } from "@/lib/comercios";
import { datos } from "@/lib/datos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  const v = validarComercio(await leerJson(req), id);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    await datos().guardarComercio(v.comercio);
    return NextResponse.json({ comercio: v.comercio });
  } catch (e) {
    return errorInterno(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  try {
    await datos().eliminarComercio(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e);
  }
}
