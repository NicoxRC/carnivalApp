/**
 * Simulador de desfile.
 *
 *   npm run simular
 *   npm run simular -- --velocidad=1.5 --desfile=demo
 *   npm run simular -- --url=https://sigue-el-desfile.vercel.app --intervalo=12
 *   INGESTA_TOKEN=… npm run simular -- --url=https://…
 *
 * Recorre la senda con un tracker falso y hace POST a /api/posiciones
 * exactamente igual que lo haría el celular de un reportero: mismo endpoint,
 * mismo payload, misma validación. No hay un camino "de mentiras" paralelo.
 *
 * Requiere que la app esté corriendo (`npm run dev` en otra terminal).
 *
 * Contra un despliegue (o en local con INGESTA_TOKEN definido) hace falta la
 * llave de ingesta: se lee de la variable INGESTA_TOKEN o de --token.
 */

import { SENDA } from "../src/lib/senda";
import { INTERVALO_REPORTE_MS, SimuladorDesfile } from "../src/lib/simulacion/motor";

interface Opciones {
  url: string;
  desfile: string;
  velocidad: number;
  intervaloS: number;
  separacion: number;
  paradas: boolean;
  inicio: number;
  token: string | null;
}

function leerArgumentos(argv: string[]): Opciones {
  const mapa = new Map<string, string>();
  for (const arg of argv) {
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (m) mapa.set(m[1], m[2] ?? "true");
  }

  const num = (clave: string, pordefecto: number) => {
    const v = mapa.get(clave);
    if (v === undefined) return pordefecto;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      console.error(`Valor inválido para --${clave}: "${v}"`);
      process.exit(1);
    }
    return n;
  };

  return {
    url: (mapa.get("url") ?? "http://localhost:3000").replace(/\/$/, ""),
    desfile: mapa.get("desfile") ?? "demo",
    velocidad: num("velocidad", 1.5),
    intervaloS: num("intervalo", INTERVALO_REPORTE_MS / 1000),
    separacion: num("separacion", 550),
    paradas: mapa.get("paradas") !== "false",
    inicio: num("inicio", 0),
    token: mapa.get("token") ?? process.env.INGESTA_TOKEN ?? null,
  };
}

const o = leerArgumentos(process.argv.slice(2));

const sim = new SimuladorDesfile({
  velocidadKmh: o.velocidad,
  separacionM: o.separacion,
  paradas: o.paradas,
  inicioM: o.inicio,
});

const endpoint = `${o.url}/api/posiciones`;
let enviados = 0;
let fallidos = 0;
let corriendo = true;

console.log(`
Sigue el Desfile — simulador
  senda      : ${SENDA.nombre} (${(SENDA.longitudMetros / 1000).toFixed(2)} km)
  destino    : ${endpoint}
  desfile    : ${o.desfile}
  velocidad  : ${o.velocidad} km/h
  intervalo  : ${o.intervaloS} s
  separación : ${o.separacion} m entre cabeza-mitad-cola
  paradas    : ${o.paradas ? "sí" : "no"}

Ctrl+C para detener.
`);

async function enviar() {
  const entradas = sim.avanzar(o.intervaloS, o.desfile);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
      },
      // Las tres posiciones en un solo POST: menos viajes, que es lo que hará
      // el reportero real cuando la red esté saturada.
      body: JSON.stringify(entradas),
    });

    if (!res.ok) {
      fallidos++;
      const texto = await res.text().catch(() => "");
      console.error(`  ✗ ${res.status} ${texto.slice(0, 160)}`);
      if (res.status === 401) {
        console.error("    Falta la llave: define INGESTA_TOKEN o pasa --token=…");
      }
      return;
    }
    enviados++;
  } catch (e) {
    fallidos++;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ sin respuesta de ${o.url} — ¿está corriendo "npm run dev"? (${msg})`);
    return;
  }

  const km = (sim.avanceM / 1000).toFixed(2);
  const total = (SENDA.longitudMetros / 1000).toFixed(2);
  const pct = Math.round((sim.avanceM / SENDA.longitudMetros) * 100);
  console.log(
    `  ✓ ${new Date().toLocaleTimeString("es-CO")} · cabeza ${km}/${total} km (${pct}%)${
      sim.parado ? " · DETENIDO" : ""
    }`,
  );

  if (sim.terminado) {
    console.log(`\nEl desfile llegó al final de la senda. Enviados: ${enviados}, fallidos: ${fallidos}.`);
    corriendo = false;
  }
}

async function bucle() {
  while (corriendo) {
    await enviar();
    if (!corriendo) break;
    await new Promise((r) => setTimeout(r, o.intervaloS * 1000));
  }
  process.exit(0);
}

process.on("SIGINT", () => {
  corriendo = false;
  console.log(`\nDetenido. Enviados: ${enviados}, fallidos: ${fallidos}.`);
  process.exit(0);
});

void bucle();
