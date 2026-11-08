import { NextResponse } from "next/server";

import { leerJson, sinCache } from "@/lib/api/respuestas";
import {
  abrirSesionAdmin,
  adminConfigurado,
  bloqueado,
  cerrarSesion,
  claveAdminValida,
  COOKIE_ADMIN,
  esAdmin,
  registrarIntento,
} from "@/lib/sesion";

export const dynamic = "force-dynamic";

/** ¿Hay sesión de admin? El panel lo pregunta al abrir. */
export async function GET() {
  return NextResponse.json({ admin: await esAdmin(), configurado: adminConfigurado() }, sinCache);
}

export async function POST(req: Request) {
  if (!adminConfigurado()) {
    return NextResponse.json(
      { error: "Falta configurar ADMIN_CLAVE en el servidor (ver .env.example)." },
      { status: 503 },
    );
  }
  if (bloqueado(req)) {
    return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto." }, { status: 429 });
  }

  const cuerpo = await leerJson(req);
  const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";
  const ok = claveAdminValida(clave);
  registrarIntento(req, ok);
  if (!ok) return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });

  await abrirSesionAdmin();
  return NextResponse.json({ admin: true });
}

export async function DELETE() {
  await cerrarSesion(COOKIE_ADMIN);
  return NextResponse.json({ admin: false });
}
