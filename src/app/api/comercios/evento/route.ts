import { NextResponse } from "next/server";

import { leerJson } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { TIPOS_METRICA, type TipoMetrica } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * Cuenta una interacción con un comercio: se abrió su ficha, tocaron WhatsApp…
 * Es lo que se le muestra al anunciante. Solo se suma un contador: no se
 * guarda quién fue ni desde dónde.
 */
export async function POST(req: Request) {
  const cuerpo = await leerJson(req);
  const id = cuerpo?.id;
  const tipo = cuerpo?.tipo as TipoMetrica;
  if (typeof id !== "string" || id.length > 64 || !TIPOS_METRICA.includes(tipo)) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  // Un contador que falla no es problema de quien está mirando el mapa.
  await datos().sumarMetrica(id, tipo).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
