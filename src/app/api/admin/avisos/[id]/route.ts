import { NextResponse } from "next/server";

import { errorInterno, requiereAdmin } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  try {
    await datos().eliminarAviso(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e);
  }
}
