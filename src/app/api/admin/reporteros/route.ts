import { NextResponse } from "next/server";

import { errorInterno, leerJson, requiereAdmin, sinCache } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { generarCodigo, hashCodigo } from "@/lib/sesion";
import { ROLES, type Rol } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export async function GET() {
  const no = await requiereAdmin();
  if (no) return no;
  try {
    return NextResponse.json({ reporteros: await datos().listarReporteros() }, sinCache);
  } catch (e) {
    return errorInterno(e);
  }
}

/**
 * Crea un reportero y devuelve su código de acceso. Es la única vez que el
 * código sale del servidor: se guarda solo su hash. Si se pierde, se genera
 * otro (PATCH con `nuevoCodigo`).
 */
export async function POST(req: Request) {
  const no = await requiereAdmin();
  if (no) return no;
  const cuerpo = await leerJson(req);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim().slice(0, 60) : "";
  const rol = cuerpo?.rol as Rol;
  if (!nombre) return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  if (!ROLES.includes(rol)) return NextResponse.json({ error: "Rol inválido." }, { status: 400 });

  const codigo = generarCodigo();
  try {
    const reportero = await datos().crearReportero({ nombre, rol }, hashCodigo(codigo));
    return NextResponse.json({ reportero, codigo }, { status: 201 });
  } catch (e) {
    return errorInterno(e);
  }
}
