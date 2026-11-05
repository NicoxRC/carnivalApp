import { NextResponse } from "next/server";

import { DESVIO_MAX_USUARIO_M, SENDA } from "@/lib/senda";

/**
 * La senda casi nunca cambia. Se sirve aparte del estado para que el navegador
 * y el service worker la cacheen y no viaje en cada actualización.
 */
export function GET() {
  return NextResponse.json({
    id: SENDA.id,
    nombre: SENDA.nombre,
    oficial: SENDA.oficial,
    advertencia: SENDA.advertencia ?? null,
    longitudMetros: SENDA.longitudMetros,
    hitos: SENDA.hitos,
    desvioMaxUsuarioM: DESVIO_MAX_USUARIO_M,
    geojson: SENDA.geojson,
  });
}
