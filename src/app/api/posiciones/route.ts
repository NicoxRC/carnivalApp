import { NextResponse } from "next/server";

import { datos, DESFILE_DEMO } from "@/lib/datos";
import { ROLES, type EntradaPosicion, type Rol } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * La única puerta de entrada de posiciones.
 * Por aquí entra el simulador y por aquí entrará el celular del reportero en Fase 2.
 * Que sea la misma puerta es deliberado: lo que se prueba en octubre es lo que corre el 31.
 */

function validar(cuerpo: unknown): EntradaPosicion[] | { error: string } {
  const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
  const salida: EntradaPosicion[] = [];

  for (const item of lista) {
    if (typeof item !== "object" || item === null) return { error: "Cuerpo inválido." };
    const o = item as Record<string, unknown>;

    const rol = o.rol;
    if (typeof rol !== "string" || !ROLES.includes(rol as Rol)) {
      return { error: `rol debe ser uno de: ${ROLES.join(", ")}.` };
    }

    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: "lat inválida." };
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { error: "lng inválida." };

    const ts = o.ts === undefined ? Date.now() : Number(o.ts);
    if (!Number.isFinite(ts)) return { error: "ts inválido." };

    const precision = o.precisionM === undefined || o.precisionM === null ? null : Number(o.precisionM);

    salida.push({
      desfileId: typeof o.desfileId === "string" && o.desfileId ? o.desfileId : DESFILE_DEMO,
      rol: rol as Rol,
      lat,
      lng,
      precisionM: precision !== null && Number.isFinite(precision) ? precision : null,
      ts,
    });
  }

  return salida;
}

export async function POST(req: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const validado = validar(cuerpo);
  if (!Array.isArray(validado)) {
    return NextResponse.json({ error: validado.error }, { status: 400 });
  }

  try {
    const adaptador = datos();
    for (const entrada of validado) {
      await adaptador.registrarPosicion(entrada);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, guardadas: validado.length });
}
