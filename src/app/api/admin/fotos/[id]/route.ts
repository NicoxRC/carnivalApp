import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  const estado = (await leerJson(req))?.estado;
  if (estado !== "aprobada" && estado !== "rechazada" && estado !== "pendiente") {
    return NextResponse.json({ error: "estado inválido." }, { status: 400 });
  }
  try {
    await datos().moderarFoto(id, estado);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  try {
    await datos().eliminarFoto(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e);
  }
}
