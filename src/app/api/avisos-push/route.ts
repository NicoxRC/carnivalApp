import { NextResponse } from "next/server";

import { errorInterno, leerJson } from "@/lib/api/respuestas";
import { datos, resolverDesfile } from "@/lib/datos";
import { pushConfigurado, VAPID_PUBLICA } from "@/lib/push";
import { SENDA } from "@/lib/senda";

export const dynamic = "force-dynamic";

/** ¿Este servidor puede mandar avisos con la app cerrada? */
export function GET() {
  return NextResponse.json({ configurado: pushConfigurado(), llave: pushConfigurado() ? VAPID_PUBLICA : null });
}

/**
 * «Avisame cuando el desfile esté cerca». Guarda a dónde mandar la notificación
 * y en qué metro de la senda espera la persona. Nada más: ni nombre ni cuenta.
 */
export async function POST(req: Request) {
  if (!pushConfigurado()) {
    return NextResponse.json({ error: "Los avisos no están configurados en este servidor." }, { status: 503 });
  }
  const cuerpo = await leerJson(req);
  const sub = cuerpo?.suscripcion as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  const metros = Number(cuerpo?.metros);
  const umbralMin = Math.min(Math.max(Math.round(Number(cuerpo?.umbralMin) || 10), 5), 60);

  if (
    typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000 ||
    typeof p256dh !== "string" || typeof auth !== "string" ||
    !Number.isFinite(metros) || metros < 0 || metros > SENDA.longitudMetros
  ) {
    return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
  }

  try {
    const desfile = await resolverDesfile();
    if (!desfile) return NextResponse.json({ error: "No hay desfile." }, { status: 404 });
    await datos().guardarSuscripcion({ endpoint, p256dh, auth, desfileId: desfile.id, metros, umbralMin });
    return NextResponse.json({ ok: true, umbralMin });
  } catch (e) {
    return errorInterno(e);
  }
}

export async function DELETE(req: Request) {
  const endpoint = (await leerJson(req))?.endpoint;
  if (typeof endpoint !== "string") return NextResponse.json({ error: "Falta el endpoint." }, { status: 400 });
  try {
    await datos().eliminarSuscripcion(endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno(e);
  }
}
