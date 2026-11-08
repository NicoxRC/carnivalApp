import { NextResponse } from "next/server";

import { datos, DESFILE_DEMO } from "@/lib/datos";
import { puntoEnMetro, SENDA } from "@/lib/senda";
import { idReporteroSesion, ingestaAbierta, tokenIngestaValido } from "@/lib/sesion";
import { ROLES, type EntradaPosicion, type Reportero, type Rol } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * La única puerta de entrada de posiciones.
 * Por aquí entra el panel de reporteros, el simulador y cualquier herramienta.
 * Que sea la misma puerta es deliberado: lo que se prueba en octubre es lo que corre el 31.
 *
 * Quién puede entrar (ver `src/lib/sesion.ts`):
 *  - un reportero con sesión: su rol lo pone el servidor, no el cuerpo;
 *  - quien traiga `Authorization: Bearer <INGESTA_TOKEN>` (el script `simular`);
 *  - cualquiera, solo en modo local sin INGESTA_TOKEN (desarrollo).
 */

/** Un punto con la hora en el futuro es un reloj mal puesto, no un dato. */
const MARGEN_FUTURO_MS = 2 * 60 * 1000;
/**
 * Puntos más viejos que esto se descartan. El panel de reporteros guarda los
 * envíos que fallan y los manda después; tras una hora ya no sirven para nada
 * y solo ensuciarían el historial.
 */
const ANTIGUEDAD_MAX_MS = 60 * 60 * 1000;
/** Un envío en lote no puede traer más que esto (≈ 1 h de cola a 20 s). */
const MAX_LOTE = 200;

type Validado = { entradas: EntradaPosicion[]; descartadas: number } | { error: string };

function validar(cuerpo: unknown, rolForzado: Rol | null, ahora: number): Validado {
  const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
  if (lista.length > MAX_LOTE) return { error: `Máximo ${MAX_LOTE} posiciones por envío.` };

  const entradas: EntradaPosicion[] = [];
  let descartadas = 0;

  for (const item of lista) {
    if (typeof item !== "object" || item === null) return { error: "Cuerpo inválido." };
    const o = item as Record<string, unknown>;

    const rol = rolForzado ?? o.rol;
    if (typeof rol !== "string" || !ROLES.includes(rol as Rol)) {
      return { error: `rol debe ser uno de: ${ROLES.join(", ")}.` };
    }

    let lat: number;
    let lng: number;
    let precision: number | null;

    if (typeof o.hitoId === "string") {
      // Sin GPS: el reportero dice por qué hito va. Se pone en el punto de la
      // senda que le corresponde, que es lo único que el ETA necesita.
      const hito = SENDA.hitos.find((h) => h.id === o.hitoId);
      if (!hito) return { error: "hitoId desconocido." };
      ({ lat, lng } = puntoEnMetro(hito.metros));
      precision = null;
    } else {
      lat = Number(o.lat);
      lng = Number(o.lng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: "lat inválida." };
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { error: "lng inválida." };
      const p = o.precisionM === undefined || o.precisionM === null ? null : Number(o.precisionM);
      precision = p !== null && Number.isFinite(p) ? p : null;
    }

    const ts = o.ts === undefined ? ahora : Number(o.ts);
    if (!Number.isFinite(ts)) return { error: "ts inválido." };
    // Un punto con mala hora no tumba el lote entero: si lo hiciera, la cola
    // del celular quedaría atascada reintentando lo mismo para siempre.
    if (ts > ahora + MARGEN_FUTURO_MS || ts < ahora - ANTIGUEDAD_MAX_MS) {
      descartadas++;
      continue;
    }

    entradas.push({
      desfileId: typeof o.desfileId === "string" && o.desfileId ? o.desfileId : DESFILE_DEMO,
      rol: rol as Rol,
      lat,
      lng,
      precisionM: precision,
      ts,
    });
  }

  return { entradas, descartadas };
}

export async function POST(req: Request) {
  let reportero: Reportero | null = null;
  const idSesion = await idReporteroSesion();

  if (idSesion) {
    reportero = await datos().leerReportero(idSesion);
    // Un código desactivado corta también las sesiones ya abiertas.
    if (!reportero?.activo) {
      return NextResponse.json({ error: "Tu acceso fue desactivado." }, { status: 401 });
    }
  } else if (!tokenIngestaValido(req) && !ingestaAbierta()) {
    return NextResponse.json({ error: "Hace falta iniciar sesión." }, { status: 401 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const ahora = Date.now();
  const validado = validar(cuerpo, reportero?.rol ?? null, ahora);
  if ("error" in validado) {
    return NextResponse.json({ error: validado.error }, { status: 400 });
  }

  // En orden de hora: si llegan desordenados, el último en escribirse tiene
  // que ser el más reciente.
  validado.entradas.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

  try {
    const adaptador = datos();
    for (const entrada of validado.entradas) {
      await adaptador.registrarPosicion(entrada, reportero?.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    guardadas: validado.entradas.length,
    descartadas: validado.descartadas,
    servidorTs: ahora,
  });
}
