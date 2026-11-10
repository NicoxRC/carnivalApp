import { NextResponse } from "next/server";

import { errorInterno, leerJson } from "@/lib/api/respuestas";
import { datos, resolverDesfile } from "@/lib/datos";
import { totalBins } from "@/lib/densidad";
import { dispositivoValido } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Gentío a lo largo de la senda, siempre del desfile actual.
 *
 * GET  → el agregado por tramo. Es lo único que sale de aquí: nunca las filas
 *        crudas, para que la respuesta no permita reconstruir por dónde anda
 *        un dispositivo concreto.
 * POST → un celular dice en qué TRAMO está. No manda lat/lng. Tiene que traer
 *        un id de dispositivo emitido por el servidor (POST /api/dispositivo).
 */

export async function GET() {
  try {
    const desfile = await resolverDesfile();
    if (!desfile) return NextResponse.json({ error: "No hay desfile." }, { status: 404 });
    const densidad = await datos().leerDensidad(desfile.id);
    return NextResponse.json(densidad, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorInterno(e);
  }
}

export async function POST(req: Request) {
  const cuerpo = await leerJson(req);
  if (!cuerpo) return NextResponse.json({ error: "JSON inválido." }, { status: 400 });

  const dispositivoId = dispositivoValido(cuerpo.dispositivo);
  if (!dispositivoId) {
    // 401 y no 400: el cliente lo entiende como "pedí un id nuevo".
    return NextResponse.json({ error: "Dispositivo no reconocido." }, { status: 401 });
  }

  const bin = Number(cuerpo.bin);
  if (!Number.isInteger(bin) || bin < 0 || bin >= totalBins()) {
    return NextResponse.json({ error: "bin fuera de la senda." }, { status: 400 });
  }

  try {
    const desfile = await resolverDesfile();
    if (!desfile) return NextResponse.json({ error: "No hay desfile." }, { status: 404 });
    await datos().registrarPresencia(desfile.id, dispositivoId, bin);
  } catch (e) {
    return errorInterno(e);
  }

  return NextResponse.json({ ok: true });
}
