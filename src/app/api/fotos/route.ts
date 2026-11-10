import { NextResponse } from "next/server";

import { errorInterno } from "@/lib/api/respuestas";
import { datos, resolverDesfile } from "@/lib/datos";
import { SENDA } from "@/lib/senda";
import { dispositivoValido } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/** Las fotos ya moderadas, de la más nueva a la más vieja. */
export async function GET() {
  try {
    const fotos = await datos().listarFotos("aprobada");
    return NextResponse.json(
      { fotos },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" } },
    );
  } catch (e) {
    return errorInterno(e);
  }
}

/** El cliente ya la reduce a ~1600 px: una foto de más de esto no pasó por la app. */
const PESO_MAX = 1.5 * 1024 * 1024;
const FOTOS_POR_HORA = 8;
const subidas = new Map<string, { n: number; hasta: number }>();

/**
 * Sube una foto. Queda PENDIENTE: nada se publica sin que alguien del equipo
 * la apruebe. No hay cuentas: se exige un id de dispositivo emitido por el
 * servidor y se limita cuántas puede mandar cada uno por hora.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formulario inválido." }, { status: 400 });
  }

  const dispositivo = dispositivoValido(form.get("dispositivo"));
  if (!dispositivo) return NextResponse.json({ error: "Dispositivo no reconocido." }, { status: 401 });

  const ahora = Date.now();
  const r = subidas.get(dispositivo);
  if (r && r.hasta > ahora && r.n >= FOTOS_POR_HORA) {
    return NextResponse.json({ error: "Ya subiste varias fotos. Probá más tarde." }, { status: 429 });
  }

  const archivo = form.get("foto");
  if (!(archivo instanceof Blob) || archivo.size === 0) {
    return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  }
  if (archivo.size > PESO_MAX) {
    return NextResponse.json({ error: "La foto pesa demasiado." }, { status: 413 });
  }
  const jpeg = Buffer.from(await archivo.arrayBuffer());
  // Los tres primeros bytes de todo JPEG. No se confía en el tipo que diga el navegador.
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) {
    return NextResponse.json({ error: "Solo se aceptan fotos JPEG." }, { status: 415 });
  }

  const m = Number(form.get("metros"));
  const metros = form.get("metros") !== null && Number.isFinite(m) && m >= 0 && m <= SENDA.longitudMetros ? m : null;

  try {
    const desfile = await resolverDesfile();
    const foto = await datos().crearFoto({ desfileId: desfile?.id ?? null, metros }, jpeg);
    subidas.set(dispositivo, { n: r && r.hasta > ahora ? r.n + 1 : 1, hasta: r && r.hasta > ahora ? r.hasta : ahora + 3600_000 });
    return NextResponse.json({ ok: true, id: foto.id }, { status: 201 });
  } catch (e) {
    return errorInterno(e);
  }
}
