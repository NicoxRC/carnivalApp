import { NextResponse } from "next/server";

import { esAdmin } from "@/lib/sesion";

/** null si la petición viene de un admin; si no, la respuesta 401 lista para devolver. */
export async function requiereAdmin(): Promise<NextResponse | null> {
  if (await esAdmin()) return null;
  return NextResponse.json({ error: "Hace falta iniciar sesión como administrador." }, { status: 401 });
}

/** Lee el cuerpo JSON sin lanzar: un cuerpo roto es un 400, no un 500. */
export async function leerJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = (await req.json()) as unknown;
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function errorInterno(e: unknown) {
  const msg = e instanceof Error ? e.message : "Error desconocido.";
  // Que quede en los registros del servidor: si no, un fallo de la base el día
  // del desfile solo lo vería quien tuviera la app abierta.
  console.error("[api]", e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export const sinCache = { headers: { "Cache-Control": "no-store" } };
