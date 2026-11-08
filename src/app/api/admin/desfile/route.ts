import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin } from "@/lib/api/respuestas";
import { datos, DESFILE_DEMO } from "@/lib/datos";

export const dynamic = "force-dynamic";

const ACCIONES = {
  iniciar: "en_curso",
  finalizar: "finalizado",
  // Borra las posiciones de la corrida anterior. El panel pide confirmación.
  reiniciar: "programado",
} as const;

/** Cambia el estado del desfile en vivo. */
export async function POST(req: Request) {
  const no = await requiereAdmin();
  if (no) return no;
  const cuerpo = await leerJson(req);
  const accion = cuerpo?.accion as keyof typeof ACCIONES;
  if (!(accion in ACCIONES)) {
    return NextResponse.json({ error: "accion debe ser iniciar | finalizar | reiniciar." }, { status: 400 });
  }
  const desfileId =
    typeof cuerpo?.desfileId === "string" && cuerpo.desfileId ? cuerpo.desfileId : DESFILE_DEMO;
  try {
    await datos().fijarEstadoDesfile(desfileId, ACCIONES[accion]);
    return NextResponse.json({ ok: true, estado: ACCIONES[accion] });
  } catch (e) {
    return errorInterno(e);
  }
}
