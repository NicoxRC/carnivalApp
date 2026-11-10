import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { MODO_DATOS } from "@/lib/datos/modo";

/**
 * Quién puede escribir.
 *
 * Leer el desfile es público. Escribir no: una posición falsa de la cabeza le
 * miente a toda la senda a la vez. Hay tres llaves, cada una para una puerta:
 *
 *  - admin      → contraseña única (`ADMIN_CLAVE`). Gestiona comercios,
 *                 reporteros y el estado del desfile.
 *  - reportero  → un código por persona que genera el admin. Solo puede
 *                 mandar posiciones, y siempre con el rol que tiene asignado.
 *  - ingesta    → `INGESTA_TOKEN`, para el script `npm run simular` y
 *                 herramientas que no tienen sesión.
 *
 * Las sesiones son cookies firmadas con HMAC (`SESION_SECRETO`): no hay tabla
 * de sesiones que consultar en cada envío del reportero.
 *
 * Es deliberadamente pequeño. Cuando se decida el backend definitivo esto se
 * puede cambiar por el auth de ese backend sin tocar las pantallas: todas
 * pasan por las funciones de este archivo.
 */

export const COOKIE_ADMIN = "sed_admin";
export const COOKIE_REPORTERO = "sed_reportero";

const DURACION_ADMIN_MS = 12 * 60 * 60 * 1000;
/** Un día de desfile entero, con margen. Que no se le cierre la sesión a mitad de senda. */
const DURACION_REPORTERO_MS = 20 * 60 * 60 * 1000;

type Carga =
  | { t: "admin"; exp: number }
  | { t: "reportero"; id: string; exp: number };

const g = globalThis as unknown as { __secretoSesion?: Buffer };

function secreto(): Buffer {
  const env = process.env.SESION_SECRETO;
  if (env && env.length >= 32) return Buffer.from(env);
  if (process.env.NODE_ENV === "production") {
    throw new Error("Falta SESION_SECRETO (mínimo 32 caracteres). Ver .env.example.");
  }
  // En desarrollo se inventa uno por proceso: las sesiones se pierden al
  // reiniciar `npm run dev`, que en desarrollo da igual.
  return (g.__secretoSesion ??= randomBytes(32));
}

function firmar(datos: string): string {
  return createHmac("sha256", secreto()).update(datos).digest("base64url");
}

function iguales(a: string, b: string): boolean {
  // Se comparan hashes para que el largo no delate nada y timingSafeEqual no lance.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function crearToken(carga: Carga): string {
  const datos = Buffer.from(JSON.stringify(carga)).toString("base64url");
  return `${datos}.${firmar(datos)}`;
}

function leerToken(token: string | undefined): Carga | null {
  if (!token) return null;
  const [datos, firma] = token.split(".");
  if (!datos || !firma || !iguales(firma, firmar(datos))) return null;
  try {
    const carga = JSON.parse(Buffer.from(datos, "base64url").toString()) as Carga;
    if (typeof carga.exp !== "number" || carga.exp < Date.now()) return null;
    return carga;
  } catch {
    return null;
  }
}

const opcionesCookie = (duracionMs: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(duracionMs / 1000),
});

/* --------------------------------- Admin --------------------------------- */

export function adminConfigurado(): boolean {
  return Boolean(process.env.ADMIN_CLAVE);
}

export function claveAdminValida(clave: string): boolean {
  const esperada = process.env.ADMIN_CLAVE;
  return Boolean(esperada) && iguales(clave, esperada as string);
}

export async function abrirSesionAdmin(): Promise<void> {
  const tienda = await cookies();
  tienda.set(
    COOKIE_ADMIN,
    crearToken({ t: "admin", exp: Date.now() + DURACION_ADMIN_MS }),
    opcionesCookie(DURACION_ADMIN_MS),
  );
}

export async function esAdmin(): Promise<boolean> {
  const tienda = await cookies();
  return leerToken(tienda.get(COOKIE_ADMIN)?.value)?.t === "admin";
}

/* ------------------------------- Reporteros ------------------------------ */

export async function abrirSesionReportero(id: string): Promise<void> {
  const tienda = await cookies();
  tienda.set(
    COOKIE_REPORTERO,
    crearToken({ t: "reportero", id, exp: Date.now() + DURACION_REPORTERO_MS }),
    opcionesCookie(DURACION_REPORTERO_MS),
  );
}

/** Id del reportero de esta petición, o null. No dice si sigue activo: eso lo mira quien llama. */
export async function idReporteroSesion(): Promise<string | null> {
  const tienda = await cookies();
  const carga = leerToken(tienda.get(COOKIE_REPORTERO)?.value);
  return carga?.t === "reportero" ? carga.id : null;
}

export async function cerrarSesion(cual: typeof COOKIE_ADMIN | typeof COOKIE_REPORTERO) {
  const tienda = await cookies();
  tienda.delete(cual);
}

/**
 * Códigos de acceso de los reporteros. Sin letras que se confundan (0/O, 1/I/L)
 * porque se dictan por teléfono o se copian de un papel en plena calle.
 */
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generarCodigo(): string {
  let c = "";
  for (let i = 0; i < 8; i++) c += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** Lo que se guarda: nunca el código en claro. Tolera minúsculas, espacios y guiones. */
export function hashCodigo(codigo: string): string {
  const limpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(`sed-reportero:${limpio}`).digest("hex");
}

/* -------------------------------- Ingesta -------------------------------- */

/**
 * Sin `INGESTA_TOKEN` y en modo local, la ingesta queda abierta: es el modo de
 * desarrollo, que además no se puede desplegar (ver README). En modo supabase
 * siempre hace falta una llave.
 */
export function ingestaAbierta(): boolean {
  return MODO_DATOS === "local" && !process.env.INGESTA_TOKEN;
}

export function tokenIngestaValido(req: Request): boolean {
  const esperado = process.env.INGESTA_TOKEN;
  if (!esperado) return false;
  const cabecera = req.headers.get("authorization") ?? "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  return Boolean(token) && iguales(token, esperado);
}

/* ------------------------------ Fuerza bruta ----------------------------- */

const intentos = new Map<string, { fallos: number; hasta: number }>();
const VENTANA_MS = 10 * 60 * 1000;
const ESPERA_MAX_MS = 5000;

/**
 * Freno a probar contraseñas o códigos a lo bruto: cada fallo reciente hace que
 * la siguiente respuesta tarde más (hasta 5 s). No bloquea a nadie.
 *
 * Antes se bloqueaba la IP un minuto tras cinco fallos, y eso tenía dos
 * problemas: detrás de un proxy que no manda la IP todos compartían el mismo
 * contador (seis fallos de cualquiera dejaban fuera al administrador con la
 * clave correcta), y la IP salía de una cabecera que el cliente puede inventar.
 * Con espera en vez de bloqueo, lo peor que logra un atacante es que el login
 * tarde 5 s; y probar 31^8 códigos a un intento cada 5 s no es un ataque.
 */
export async function frenar(req: Request): Promise<void> {
  const r = intentos.get(ip(req));
  if (!r || r.hasta < Date.now()) return;
  await new Promise((ok) => setTimeout(ok, Math.min(r.fallos * 500, ESPERA_MAX_MS)));
}

export function registrarIntento(req: Request, ok: boolean) {
  const clave = ip(req);
  if (ok) {
    intentos.delete(clave);
    return;
  }
  const ahora = Date.now();
  const r = intentos.get(clave);
  intentos.set(clave, { fallos: r && r.hasta > ahora ? r.fallos + 1 : 1, hasta: ahora + VENTANA_MS });
  // Que el mapa no crezca sin fin si alguien rota IPs.
  if (intentos.size > 5000) {
    for (const [k, v] of intentos) if (v.hasta < ahora) intentos.delete(k);
  }
}

/**
 * La IP de quien llama, para los frenos. Se prefieren las cabeceras que pone la
 * plataforma (el cliente no las puede falsificar) y, de `x-forwarded-for`, el
 * ÚLTIMO salto: el primero lo escribe quien hace la petición.
 */
export function ip(req: Request): string {
  const h = req.headers;
  const directa = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip");
  if (directa) return directa.split(",")[0].trim();
  const cadena = h.get("x-forwarded-for");
  if (cadena) return cadena.split(",").pop()!.trim();
  return "local";
}

/* ------------------------- Identidad de dispositivo ----------------------- */

/**
 * El gentío cuenta dispositivos. Antes el celular inventaba su propio id, así
 * que un script podía mandar mil ids y pintar un tramo de «lleno». Ahora el id
 * lo emite el servidor, firmado, y emitir tiene tope por IP: falsear el mapa
 * exige muchas IPs, no un bucle.
 *
 * El tope es generoso a propósito: los operadores móviles sacan a miles de
 * celulares por la misma IP, y un tope bajo dejaría fuera a gente real.
 */
const EMISIONES_POR_IP_HORA = 300;
const emisiones = new Map<string, { n: number; hasta: number }>();

export function emitirDispositivo(req: Request): string | null {
  const clave = ip(req);
  const ahora = Date.now();
  const r = emisiones.get(clave);
  if (r && r.hasta > ahora) {
    if (r.n >= EMISIONES_POR_IP_HORA) return null;
    r.n++;
  } else {
    emisiones.set(clave, { n: 1, hasta: ahora + 60 * 60 * 1000 });
  }
  if (emisiones.size > 5000) {
    for (const [k, v] of emisiones) if (v.hasta < ahora) emisiones.delete(k);
  }
  const id = randomBytes(12).toString("base64url");
  return `${id}.${firmar(`dispositivo:${id}`).slice(0, 22)}`;
}

/** Devuelve el id si el token lo emitió este servidor; si no, null. */
export function dispositivoValido(token: unknown): string | null {
  if (typeof token !== "string" || token.length > 64) return null;
  const [id, firma] = token.split(".");
  if (!id || !firma) return null;
  return iguales(firma, firmar(`dispositivo:${id}`).slice(0, 22)) ? id : null;
}
