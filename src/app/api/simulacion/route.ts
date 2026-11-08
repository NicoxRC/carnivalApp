import { NextResponse } from "next/server";

import { datos, DESFILE_DEMO, MODO_DATOS } from "@/lib/datos";
import { SENDA } from "@/lib/senda";
import { SimuladorDesfile } from "@/lib/simulacion/motor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Simulador embebido: un botón en la app en vez de una segunda terminal.
 * Es lo que permite abrir el portátil en una sala de juntas y que el desfile
 * ya esté caminando en 5 segundos.
 *
 * Corre dentro del proceso de Next, así que solo sirve con `npm run dev` o
 * `npm start` en una máquina. En serverless (Vercel) no persiste: allá se usa
 * el script `npm run simular` apuntando al despliegue, o Supabase.
 */

interface SimActiva {
  sim: SimuladorDesfile;
  timer: NodeJS.Timeout;
  desfileId: string;
  intervaloS: number;
  velocidadKmh: number;
  iniciadaEn: number;
}

const g = globalThis as unknown as { __simDesfile?: Map<string, SimActiva> };
const activas = (g.__simDesfile ??= new Map());

function detener(desfileId: string) {
  const a = activas.get(desfileId);
  if (!a) return false;
  clearInterval(a.timer);
  activas.delete(desfileId);
  return true;
}

function resumen(desfileId: string) {
  const a = activas.get(desfileId);
  return {
    corriendo: Boolean(a),
    desfileId,
    velocidadKmh: a?.velocidadKmh ?? null,
    intervaloS: a?.intervaloS ?? null,
    avanceM: a ? Math.round(a.sim.avanceM) : null,
    parado: a ? a.sim.parado : null,
    longitudSendaM: Math.round(SENDA.longitudMetros),
  };
}

/**
 * Solo existe en modo local. En modo supabase la app ya es «de verdad»: un
 * botón público que mueve el desfile sería una puerta para mentirle a la senda.
 */
function soloLocal() {
  return MODO_DATOS === "local"
    ? null
    : NextResponse.json({ error: "El simulador embebido solo funciona en modo local." }, { status: 404 });
}

export function GET(req: Request) {
  const bloqueo = soloLocal();
  if (bloqueo) return bloqueo;
  const desfileId = new URL(req.url).searchParams.get("desfile") ?? DESFILE_DEMO;
  return NextResponse.json(resumen(desfileId));
}

export async function POST(req: Request) {
  const bloqueo = soloLocal();
  if (bloqueo) return bloqueo;

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    // Cuerpo vacío = iniciar con valores por defecto.
  }

  const desfileId =
    typeof cuerpo.desfileId === "string" && cuerpo.desfileId ? cuerpo.desfileId : DESFILE_DEMO;
  const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "iniciar";

  if (accion === "detener") {
    detener(desfileId);
    return NextResponse.json(resumen(desfileId));
  }

  if (accion === "reiniciar") {
    detener(desfileId);
    await datos().fijarEstadoDesfile(desfileId, "programado");
    return NextResponse.json(resumen(desfileId));
  }

  if (accion !== "iniciar") {
    return NextResponse.json({ error: "accion debe ser iniciar | detener | reiniciar." }, { status: 400 });
  }

  detener(desfileId); // Nunca dos simulaciones sobre el mismo desfile.

  // Arrancar una simulación es arrancar un desfile nuevo: hay que botar el
  // historial de la corrida anterior. Si no, la velocidad se estima mezclando
  // dos recorridos y salen ETAs absurdos.
  await datos().fijarEstadoDesfile(desfileId, "programado");

  const velocidadKmh = Number(cuerpo.velocidadKmh ?? 1.5) || 1.5;
  // Más rápido que los 12 s reales: en un demo nadie espera 12 segundos a ver algo moverse.
  const intervaloS = Math.max(1, Number(cuerpo.intervaloS ?? 3) || 3);
  const inicioM = Number(cuerpo.inicioM ?? 0) || 0;

  const sim = new SimuladorDesfile({ velocidadKmh, inicioM, paradas: cuerpo.paradas !== false });
  const adaptador = datos();

  const tick = async () => {
    try {
      for (const entrada of sim.avanzar(intervaloS, desfileId)) {
        await adaptador.registrarPosicion(entrada);
      }
      if (sim.terminado) {
        detener(desfileId);
        await adaptador.fijarEstadoDesfile(desfileId, "finalizado");
      }
    } catch (e) {
      console.error("[simulacion] tick falló:", e);
    }
  };

  const timer = setInterval(tick, intervaloS * 1000);
  activas.set(desfileId, {
    sim,
    timer,
    desfileId,
    intervaloS,
    velocidadKmh,
    iniciadaEn: Date.now(),
  });

  await tick(); // Que el primer dato exista ya, no en 3 segundos.

  return NextResponse.json(resumen(desfileId));
}
