import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { generarCodigo, hashCodigo } from "@/lib/sesion";
import { ROLES, type Rol } from "@/lib/tipos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Cambia nombre, rol o activo; con `nuevoCodigo: true` invalida el viejo y devuelve uno nuevo. */
export async function PATCH(req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  const cuerpo = (await leerJson(req)) ?? {};

  const cambios: { nombre?: string; rol?: Rol; activo?: boolean; codigoHash?: string } = {};
  if (typeof cuerpo.nombre === "string" && cuerpo.nombre.trim()) {
    cambios.nombre = cuerpo.nombre.trim().slice(0, 60);
  }
  if (cuerpo.rol !== undefined) {
    if (!ROLES.includes(cuerpo.rol as Rol)) {
      return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
    }
    cambios.rol = cuerpo.rol as Rol;
  }
  if (typeof cuerpo.activo === "boolean") cambios.activo = cuerpo.activo;

  const codigo = cuerpo.nuevoCodigo === true ? generarCodigo() : null;
  if (codigo) cambios.codigoHash = hashCodigo(codigo);

  try {
    const reportero = await datos().actualizarReportero(id, cambios);
    if (!reportero) return NextResponse.json({ error: "No existe." }, { status: 404 });
    return NextResponse.json({ reportero, codigo });
  } catch (e) {
    return errorInterno(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const no = await requiereAdmin();
  if (no) return no;
  const { id } = await params;
  try {
    await datos().eliminarReportero(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e);
  }
}
