import { NextResponse } from "next/server";

import { emitirDispositivo } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Emite un id de dispositivo firmado. Es anónimo: no dice nada de la persona,
 * solo que este servidor lo entregó. Lo usan el gentío y la subida de fotos
 * para que no se puedan inventar dispositivos a montones.
 */
export function POST(req: Request) {
  const dispositivo = emitirDispositivo(req);
  if (!dispositivo) {
    return NextResponse.json({ error: "Demasiados dispositivos desde esta red." }, { status: 429 });
  }
  return NextResponse.json({ dispositivo });
}
