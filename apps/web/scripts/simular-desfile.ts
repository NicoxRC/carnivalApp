/**
 * Simulador de desfile.
 *
 *   npm run simular
 *   npm run simular -- --velocidad=1.5 --intervalo=12
 *   npm run simular -- --url=https://api.… --email=… --password=…
 *
 * Recorre la senda con un tracker falso y manda las tres posiciones (cabeza,
 * mitad, cola) al backend por `POST /api/positions`, la misma puerta del
 * celular de un reportero: mismo endpoint, misma validación. No hay un camino
 * "de mentiras" paralelo. Siempre al desfile ACTUAL, que decide el backend.
 *
 * Entra con un usuario de servicio con rol `ingest` (puede mandar cualquier
 * puesto). En local, `just seed` crea `simulator@local` y este script lo usa
 * por defecto; requiere el backend corriendo (`just dev`). Contra otro
 * servidor hay que pasar --email y --password (o SIMULADOR_EMAIL y
 * SIMULADOR_PASSWORD) de una cuenta real.
 */

import { posicionParaApi } from "../src/lib/api/posiciones";
import { SENDA } from "../src/lib/senda";
import { INTERVALO_REPORTE_MS, SimuladorDesfile } from "../src/lib/simulacion/motor";

/** Las de `just seed` (`apps/backend/app/cli.py`). Solo existen en una base local. */
const URL_LOCAL = "http://localhost:8000";
const EMAIL_LOCAL = "simulator@local";
const PASSWORD_LOCAL = "simulator-dev-only";

interface Opciones {
  url: string;
  email: string;
  password: string;
  velocidad: number;
  intervaloS: number;
  separacion: number;
  paradas: boolean;
  inicio: number;
}

function esLocal(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
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

  const url = (mapa.get("url") ?? URL_LOCAL).replace(/\/+$/, "");
  const email = mapa.get("email") ?? process.env.SIMULADOR_EMAIL;
  const password = mapa.get("password") ?? process.env.SIMULADOR_PASSWORD;
  if ((!email || !password) && !esLocal(url)) {
    // Las credenciales de desarrollo nunca salen hacia un servidor real.
    console.error(`Contra ${url} hace falta una cuenta real: --email=… --password=… (o SIMULADOR_EMAIL y SIMULADOR_PASSWORD).`);
    process.exit(1);
  }

  return {
    url,
    email: email ?? EMAIL_LOCAL,
    password: password ?? PASSWORD_LOCAL,
    velocidad: num("velocidad", 1.5),
    intervaloS: num("intervalo", INTERVALO_REPORTE_MS / 1000),
    separacion: num("separacion", 550),
    paradas: mapa.get("paradas") !== "false",
    inicio: num("inicio", 0),
  };
}

const o = leerArgumentos(process.argv.slice(2));

const sim = new SimuladorDesfile({
  velocidadKmh: o.velocidad,
  separacionM: o.separacion,
  paradas: o.paradas,
  inicioM: o.inicio,
});

const endpoint = `${o.url}/api/positions`;
let token: string | null = null;
let enviados = 0;
let fallidos = 0;
let corriendo = true;

console.log(`
Sigue el Desfile — simulador
  senda      : ${SENDA.nombre} (${(SENDA.longitudMetros / 1000).toFixed(2)} km)
  destino    : ${endpoint} (el desfile actual)
  usuario    : ${o.email}
  velocidad  : ${o.velocidad} km/h
  intervalo  : ${o.intervaloS} s
  separación : ${o.separacion} m entre cabeza-mitad-cola
  paradas    : ${o.paradas ? "sí" : "no"}

Ctrl+C para detener.
`);

/** El mensaje del backend (`{"error": "..."}`) o, si no hay, el cuerpo crudo. */
async function mensajeDe(res: Response): Promise<string> {
  const texto = await res.text().catch(() => "");
  try {
    const cuerpo = JSON.parse(texto) as { error?: unknown };
    if (typeof cuerpo.error === "string") return cuerpo.error;
  } catch {
    // No era JSON.
  }
  return texto.slice(0, 160);
}

/** Inicia sesión y guarda el token. Una cuenta mal puesta detiene el script. */
async function entrar(): Promise<void> {
  const res = await fetch(`${o.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: o.email, password: o.password }),
  });
  if (!res.ok) {
    console.error(`  ✗ no se pudo entrar como ${o.email}: ${res.status} ${await mensajeDe(res)}`);
    if (o.email === EMAIL_LOCAL) console.error("    ¿Corriste `just seed`? Crea ese usuario en la base local.");
    process.exit(1);
  }
  token = ((await res.json()) as { token: string }).token;
}

function mandar(cuerpo: string): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: cuerpo,
  });
}

async function enviar() {
  // Las tres posiciones en un solo POST: menos viajes, que es lo que hará el
  // reportero real cuando la red esté saturada. El id del desfile no viaja.
  const cuerpo = JSON.stringify(sim.avanzar(o.intervaloS, "actual").map(posicionParaApi));

  try {
    if (!token) await entrar();
    let res = await mandar(cuerpo);
    if (res.status === 401) {
      // El token venció (dura 20 h) o lo revocaron: se entra de nuevo una vez.
      await entrar();
      res = await mandar(cuerpo);
    }

    if (!res.ok) {
      fallidos++;
      console.error(`  ✗ ${res.status} ${await mensajeDe(res)}`);
      if (res.status === 401 || res.status === 403) {
        console.error(`    ${o.email} no puede mandar posiciones: necesita el rol ingest.`);
        process.exit(1);
      }
      return;
    }
    enviados++;
  } catch (e) {
    fallidos++;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ sin respuesta de ${o.url} — ¿está corriendo el backend (\`just dev\`)? (${msg})`);
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
