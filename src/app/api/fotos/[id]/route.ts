import { NextResponse } from "next/server";

import { errorInterno } from "@/lib/api/respuestas";
import { datos } from "@/lib/datos";
import { esAdmin } from "@/lib/sesion";

export const dynamic = "force-dynamic";

/**
 * La imagen. Solo las aprobadas son públicas; una pendiente o rechazada solo
 * la ve un administrador (para poder moderarla).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const foto = await datos().leerArchivoFoto(id);
    if (!foto) return new Response(null, { status: 404 });
    const publica = foto.estado === "aprobada";
    if (!publica && !(await esAdmin())) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(foto.jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": publica ? "public, max-age=86400" : "private, no-store",
      },
    });
  } catch (e) {
    return errorInterno(e);
  }
}
