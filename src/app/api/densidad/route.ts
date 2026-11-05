import { NextResponse } from "next/server";

import { datos, DESFILE_DEMO } from "@/lib/datos";
import { totalBins } from "@/lib/densidad";

export const dynamic = "force-dynamic";

/**
 * Gentío a lo largo de la senda.
 *
 * GET  → el agregado por tramo. Es lo único que sale de aquí: nunca las filas
 *        crudas, para que la respuesta no permita reconstruir por dónde anda
 *        un dispositivo concreto.
 * POST → un celular dice en qué TRAMO está. No manda lat/lng.
 */

export async function GET(req: Request) {
  const desfileId = new URL(req.url).searchParams.get("desfile") ?? DESFILE_DEMO;
  try {
    const densidad = await datos().leerDensidad(desfileId);
    return NextResponse.json(densidad, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const desfileId =
    typeof cuerpo.desfileId === "string" && cuerpo.desfileId ? cuerpo.desfileId : DESFILE_DEMO;

  const dispositivoId = cuerpo.dispositivoId;
  // Se acota a lo que genera el cliente (un uuid): así esta tabla no se puede
  // usar para meter identificadores de otra cosa.
  if (typeof dispositivoId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(dispositivoId)) {
    return NextResponse.json({ error: "dispositivoId inválido." }, { status: 400 });
  }

  const bin = Number(cuerpo.bin);
  if (!Number.isInteger(bin) || bin < 0 || bin >= totalBins()) {
    return NextResponse.json({ error: "bin fuera de la senda." }, { status: 400 });
  }

  try {
    await datos().registrarPresencia(desfileId, dispositivoId, bin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
