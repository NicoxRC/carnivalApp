import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { validarDesfile } from "@/lib/programacion";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ACCIONES = {
  iniciar: "en_curso",
  finalizar: "finalizado",
  // Borra las posiciones de la corrida anterior. El panel pide confirmación.
  reiniciar: "programado",
} as const;

export async function PUT(req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  const v = validarDesfile(await leerJson(req), id);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    await datos().guardarDesfile(v.desfile);
    return NextResponse.json({ desfile: v.desfile });
  } catch (e) {
    return errorInterno(e);
  }
}

/** Cambia el estado: `{ accion: "iniciar" | "finalizar" | "reiniciar" }`. */
export async function PATCH(req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  const accion = (await leerJson(req))?.accion as keyof typeof ACCIONES;
  if (!(accion in ACCIONES)) {
    return NextResponse.json({ error: "accion debe ser iniciar | finalizar | reiniciar." }, { status: 400 });
  }
  try {
    await datos().fijarEstadoDesfile(id, ACCIONES[accion]);
    return NextResponse.json({ ok: true, estado: ACCIONES[accion] });
  } catch (e) {
    return errorInterno(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  try {
    await datos().eliminarDesfile(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e);
  }
}
