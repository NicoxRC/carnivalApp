import { NextResponse } from "next/server";

import { errorInterno, leerJson, sinCache } from "@/lib/api/respuestas";
import { datos, resolverDesfile } from "@/lib/datos";
import {
  abrirSesionReportero,
  frenar,
  cerrarSesion,
  COOKIE_REPORTERO,
  hashCodigo,
  idReporteroSesion,
  registrarIntento,
} from "@/lib/sesion";

export const dynamic = "force-dynamic";

/** Quién soy. El panel lo pregunta al abrir para saltarse la pantalla del código. */
export async function GET() {
  const id = await idReporteroSesion();
  if (!id) return NextResponse.json({ reportero: null }, sinCache);
  try {
    const reportero = await datos().leerReportero(id);
    if (!reportero?.activo) return NextResponse.json({ reportero: null }, sinCache);
    const desfile = await resolverDesfile();
    return NextResponse.json({ reportero, desfile: desfile?.nombre ?? null }, sinCache);
  } catch (e) {
    return errorInterno(e);
  }
}

export async function POST(req: Request) {
  await frenar(req);
  const cuerpo = await leerJson(req);
  const codigo = typeof cuerpo?.codigo === "string" ? cuerpo.codigo : "";
  if (!codigo.trim()) return NextResponse.json({ error: "Escribí tu código." }, { status: 400 });

  try {
    const reportero = await datos().buscarReporteroPorCodigo(hashCodigo(codigo));
    registrarIntento(req, Boolean(reportero));
    if (!reportero) {
      return NextResponse.json({ error: "Ese código no sirve. Revisalo con el coordinador." }, { status: 401 });
    }
    await abrirSesionReportero(reportero.id);
    const desfile = await resolverDesfile();
    return NextResponse.json({ reportero, desfile: desfile?.nombre ?? null });
  } catch (e) {
    return errorInterno(e);
  }
}

export async function DELETE() {
  await cerrarSesion(COOKIE_REPORTERO);
  return NextResponse.json({ reportero: null });
}
