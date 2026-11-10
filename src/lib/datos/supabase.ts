import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { clasificar, VENTANA_DENSIDAD_MS, type Densidad } from "@/lib/densidad";
import { metrosEnSenda, SENDA } from "@/lib/senda";
import {
  MS_VENTANA_HISTORIAL,
  type Aviso,
  type Comercio,
  type Desfile,
  type EntradaPosicion,
  type EstadoDesfile,
  type Evento,
  type Foto,
  type MuestraHistorial,
  type Posicion,
  type Reportero,
  type Rol,
  type SuscripcionAviso,
  type TipoMetrica,
} from "@/lib/tipos";
import type { AdaptadorDatos } from "@/lib/datos/adaptador";

/**
 * Camino de producción. NO ESTÁ PROBADO CONTRA UN PROYECTO REAL todavía
 * (ver README, "Estado de los dos adaptadores"). Está escrito para que conectar
 * Supabase sea cambiar variables de entorno, no reescribir la app.
 */

export const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const ANON_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function hayCredencialesSupabase(): boolean {
  return Boolean(URL_SUPABASE && ANON_SUPABASE);
}

let clienteServidor: SupabaseClient | null = null;

function servidor(): SupabaseClient {
  if (clienteServidor) return clienteServidor;
  // Solo la service_role: con la llave anónima las tablas privadas (reporteros,
  // presencias) devuelven vacío sin error por RLS, y el login de reporteros
  // fallaría sin decir por qué.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_SUPABASE || !key) {
    throw new Error(
      "Falta configurar Supabase. Define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local, o usa NEXT_PUBLIC_DATOS=local.",
    );
  }
  clienteServidor = createClient(URL_SUPABASE, key, {
    auth: { persistSession: false },
  });
  return clienteServidor;
}

/** Cliente de navegador — el que abre el websocket de Realtime. */
export function clienteNavegador(): SupabaseClient {
  return createClient(URL_SUPABASE, ANON_SUPABASE, {
    realtime: { params: { eventsPerSecond: 2 } },
  });
}

interface FilaPosicion {
  rol: Rol;
  lat: number;
  lng: number;
  metros_en_senda: number;
  precision_m: number | null;
  creado_en: string;
}

function aPosicion(f: FilaPosicion): Posicion {
  return {
    rol: f.rol,
    lat: f.lat,
    lng: f.lng,
    metros: Number(f.metros_en_senda),
    precisionM: f.precision_m,
    ts: new Date(f.creado_en).getTime(),
  };
}

interface FilaDesfile {
  id: string;
  nombre: string;
  fecha: string | null;
  hora_inicio: string | null;
  estado: EstadoDesfile["estado"];
}

function aDesfile(f: FilaDesfile): Desfile {
  return {
    id: f.id,
    nombre: f.nombre,
    fecha: f.fecha ?? "",
    // Postgres devuelve "09:00:00".
    horaInicio: (f.hora_inicio ?? "00:00").slice(0, 5),
    estado: f.estado,
  };
}

interface FilaEvento {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  titulo: string;
  descripcion: string | null;
  categoria: Evento["categoria"] | null;
  lugar_nombre: string | null;
  lat: number | null;
  lng: number | null;
  patrocinado: boolean;
}

function aEvento(f: FilaEvento): Evento {
  return {
    id: f.id,
    fecha: f.fecha,
    horaInicio: f.hora_inicio.slice(0, 5),
    horaFin: f.hora_fin ? f.hora_fin.slice(0, 5) : null,
    titulo: f.titulo,
    descripcion: f.descripcion ?? "",
    categoria: f.categoria ?? "cultural",
    lugarNombre: f.lugar_nombre ?? "",
    lat: f.lat,
    lng: f.lng,
    patrocinado: f.patrocinado,
  };
}

interface FilaAviso {
  id: string;
  texto: string;
  nivel: Aviso["nivel"];
  creado_en: string;
  expira_en: string | null;
}

function aAviso(f: FilaAviso): Aviso {
  return {
    id: f.id,
    texto: f.texto,
    nivel: f.nivel,
    creadoEn: new Date(f.creado_en).getTime(),
    expiraEn: f.expira_en ? new Date(f.expira_en).getTime() : null,
  };
}

interface FilaComercio {
  id: string;
  nombre: string;
  categoria: Comercio["categoria"];
  descripcion: string | null;
  direccion: string | null;
  horario: string | null;
  lat: number;
  lng: number;
  plan: Comercio["plan"];
  promo: string | null;
  promo_momento: Comercio["promoMomento"] | null;
  menu: Comercio["menu"] | null;
  whatsapp: string | null;
  enlace: string | null;
  visible: boolean;
}

function aComercio(f: FilaComercio): Comercio {
  return {
    id: f.id,
    nombre: f.nombre,
    categoria: f.categoria,
    descripcion: f.descripcion ?? "",
    direccion: f.direccion ?? "",
    horario: f.horario ?? "",
    lat: Number(f.lat),
    lng: Number(f.lng),
    plan: f.plan,
    promo: f.promo,
    promoMomento: f.promo_momento ?? "siempre",
    menu: f.menu ?? [],
    whatsapp: f.whatsapp,
    enlace: f.enlace,
    visible: f.visible,
  };
}

interface FilaReportero {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  ultima_senal: string | null;
  creado_en: string;
}

/** Columnas que se pueden leer. `codigo_hash` no está: no sale nunca del servidor. */
const COLUMNAS_REPORTERO = "id, nombre, rol, activo, ultima_senal, creado_en";

function aReportero(f: FilaReportero): Reportero {
  return {
    id: f.id,
    nombre: f.nombre,
    rol: f.rol,
    activo: f.activo,
    ultimaSenalTs: f.ultima_senal ? new Date(f.ultima_senal).getTime() : null,
    creadoEn: new Date(f.creado_en).getTime(),
  };
}

interface FilaFoto {
  id: string;
  desfile_id: string | null;
  storage_path: string;
  metros_en_senda: number | null;
  estado: Foto["estado"];
  creado_en: string;
}

const BUCKET_FOTOS = "fotos";

function aFoto(f: FilaFoto): Foto {
  return {
    id: f.id,
    desfileId: f.desfile_id,
    metros: f.metros_en_senda === null ? null : Number(f.metros_en_senda),
    estado: f.estado,
    creadoEn: new Date(f.creado_en).getTime(),
    // Las pendientes también se sirven por nuestra API (que exige admin), no por
    // la URL pública del bucket: así una foto sin moderar no tiene enlace público.
    url: `/api/fotos/${f.id}`,
  };
}

/** Un error de la base no puede quedar en silencio: la UI mostraría "sin reportes" en vez de "sin conexión". */
function falla(que: string, error: { message: string } | null) {
  if (error) throw new Error(`${que}: ${error.message}`);
}

/** El recorrido completo de la cabeza. Un desfile de 5 h a 20 s son ~900 filas. */
const MAX_RECORRIDO = 8000;

export const adaptadorSupabase: AdaptadorDatos = {
  nombre: "supabase",

  async registrarPosiciones(entradas: EntradaPosicion[], reporteroId?: string) {
    if (entradas.length === 0) return;
    const db = servidor();
    const desfileId = entradas[0].desfileId;
    // La proyección sobre la senda se precalcula aquí, no en la base: así la
    // tabla guarda el número listo y ninguna lectura tiene que recalcularlo.
    // Un solo INSERT para todo el lote: la cola de un reportero que estuvo sin
    // señal puede traer decenas de puntos.
    const filas = entradas.map((e) => ({
      desfile_id: e.desfileId,
      reportero_id: reporteroId ?? null,
      rol: e.rol,
      lat: e.lat,
      lng: e.lng,
      metros_en_senda: metrosEnSenda(e.lat, e.lng).metros,
      precision_m: e.precisionM ?? null,
      creado_en: new Date(e.ts ?? Date.now()).toISOString(),
    }));
    const { error } = await db.from("posiciones").insert(filas);
    if (error) throw new Error(`No se pudo guardar la posición: ${error.message}`);

    // Igual que el adaptador local: la primera posición arranca el desfile.
    // Estas dos escrituras son secundarias: si fallan, la posición ya quedó.
    const ultima = filas.reduce((a, b) => (a.creado_en > b.creado_en ? a : b)).creado_en;
    await Promise.all([
      db.from("desfiles").update({ estado: "en_curso" }).eq("id", desfileId).eq("estado", "programado"),
      reporteroId
        ? db.from("reporteros").update({ ultima_senal: ultima }).eq("id", reporteroId)
        : Promise.resolve(),
    ]);
  },

  async leerEstado(desfileId: string): Promise<EstadoDesfile | null> {
    const db = servidor();
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - MS_VENTANA_HISTORIAL).toISOString();

    const [desfile, ultimas, historial, avisos] = await Promise.all([
      db.from("desfiles").select("id, nombre, fecha, hora_inicio, estado").eq("id", desfileId).maybeSingle(),
      db.from("ultimas_posiciones").select("*").eq("desfile_id", desfileId),
      db
        .from("posiciones")
        .select("metros_en_senda, creado_en")
        .eq("desfile_id", desfileId)
        .eq("rol", "cabeza")
        .gte("creado_en", desde)
        .order("creado_en", { ascending: true }),
      db.from("avisos").select("*").or(`expira_en.is.null,expira_en.gt.${ahora.toISOString()}`),
    ]);

    falla("No se pudo leer el desfile", desfile.error);
    falla("No se pudieron leer las posiciones", ultimas.error);
    falla("No se pudo leer el historial", historial.error);
    falla("No se pudieron leer los avisos", avisos.error);
    if (!desfile.data) return null;
    const d = aDesfile(desfile.data as FilaDesfile);

    const posiciones: Partial<Record<Rol, Posicion>> = {};
    for (const fila of (ultimas.data ?? []) as FilaPosicion[]) {
      posiciones[fila.rol] = aPosicion(fila);
    }

    return {
      desfileId,
      nombre: d.nombre,
      estado: d.estado,
      fecha: d.fecha,
      horaInicio: d.horaInicio,
      sendaId: SENDA.id,
      posiciones,
      historialCabeza: (historial.data ?? []).map((f) => ({
        metros: Number(f.metros_en_senda),
        ts: new Date(f.creado_en as string).getTime(),
      })),
      avisos: ((avisos.data ?? []) as FilaAviso[]).map(aAviso),
      servidorTs: Date.now(),
    };
  },

  async fijarEstadoDesfile(desfileId: string, estado: EstadoDesfile["estado"]) {
    const db = servidor();
    // Volver a «programado» es reiniciar, igual que en el adaptador local: si
    // quedara el historial de la corrida anterior, la velocidad se estimaría
    // mezclando dos recorridos.
    if (estado === "programado") {
      const borrado = await db.from("posiciones").delete().eq("desfile_id", desfileId);
      falla("No se pudo reiniciar el desfile", borrado.error);
    }
    const { error } = await db.from("desfiles").update({ estado }).eq("id", desfileId);
    falla("No se pudo cambiar el estado del desfile", error);
  },

  async ultimoEmisor(desfileId: string, rol: Rol) {
    const { data, error } = await servidor()
      .from("posiciones")
      .select("reportero_id, creado_en")
      .eq("desfile_id", desfileId)
      .eq("rol", rol)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    falla("No se pudo leer el último emisor", error);
    if (!data) return null;
    return { reporteroId: data.reportero_id as string | null, ts: new Date(data.creado_en as string).getTime() };
  },

  async leerRecorrido(desfileId: string): Promise<MuestraHistorial[]> {
    const { data, error } = await servidor()
      .from("posiciones")
      .select("metros_en_senda, creado_en")
      .eq("desfile_id", desfileId)
      .eq("rol", "cabeza")
      .order("creado_en", { ascending: true })
      .limit(MAX_RECORRIDO);
    falla("No se pudo leer el recorrido", error);
    return (data ?? []).map((f) => ({
      metros: Number(f.metros_en_senda),
      ts: new Date(f.creado_en as string).getTime(),
    }));
  },

  async registrarPresencia(desfileId: string, dispositivoId: string, bin: number) {
    // upsert por (desfile, dispositivo): una fila por celular, no un historial.
    // No se guarda dónde estuvo antes: solo dónde está ahora.
    const { error } = await servidor()
      .from("presencias")
      .upsert(
        { desfile_id: desfileId, dispositivo_id: dispositivoId, bin, visto_en: new Date().toISOString() },
        { onConflict: "desfile_id,dispositivo_id" },
      );
    if (error) throw new Error(`No se pudo registrar la presencia: ${error.message}`);
  },

  async leerDensidad(desfileId: string): Promise<Densidad> {
    const desde = new Date(Date.now() - VENTANA_DENSIDAD_MS).toISOString();
    const { data, error } = await servidor()
      .from("presencias")
      .select("bin")
      .eq("desfile_id", desfileId)
      .gte("visto_en", desde);
    if (error) throw new Error(`No se pudo leer el gentío: ${error.message}`);

    const conteos = new Map<number, number>();
    for (const fila of data ?? []) {
      const bin = Number((fila as { bin: number }).bin);
      conteos.set(bin, (conteos.get(bin) ?? 0) + 1);
    }
    return clasificar(conteos, (data ?? []).length);
  },

  async listarDesfiles() {
    const { data, error } = await servidor()
      .from("desfiles")
      .select("id, nombre, fecha, hora_inicio, estado")
      .order("fecha");
    falla("No se pudieron leer los desfiles", error);
    return ((data ?? []) as FilaDesfile[]).map(aDesfile);
  },

  async guardarDesfile(d) {
    // Sin `estado`: en una fila nueva vale el default («programado») y en una
    // existente no se toca.
    const { error } = await servidor()
      .from("desfiles")
      .upsert({ id: d.id, nombre: d.nombre, fecha: d.fecha, hora_inicio: d.horaInicio });
    falla("No se pudo guardar el desfile", error);
  },

  async eliminarDesfile(id: string) {
    const { error } = await servidor().from("desfiles").delete().eq("id", id);
    falla("No se pudo borrar el desfile", error);
  },

  async listarEventos() {
    const { data, error } = await servidor().from("eventos").select("*").order("fecha").order("hora_inicio");
    falla("No se pudieron leer los eventos", error);
    return ((data ?? []) as FilaEvento[]).map(aEvento);
  },

  async guardarEvento(e: Evento) {
    const { error } = await servidor().from("eventos").upsert({
      id: e.id,
      fecha: e.fecha,
      hora_inicio: e.horaInicio,
      hora_fin: e.horaFin,
      titulo: e.titulo,
      descripcion: e.descripcion,
      categoria: e.categoria,
      lugar_nombre: e.lugarNombre,
      lat: e.lat,
      lng: e.lng,
      patrocinado: e.patrocinado,
    });
    falla("No se pudo guardar el evento", error);
  },

  async eliminarEvento(id: string) {
    const { error } = await servidor().from("eventos").delete().eq("id", id);
    falla("No se pudo borrar el evento", error);
  },

  async listarAvisos() {
    const { data, error } = await servidor()
      .from("avisos")
      .select("*")
      .or(`expira_en.is.null,expira_en.gt.${new Date().toISOString()}`)
      .order("creado_en");
    falla("No se pudieron leer los avisos", error);
    return ((data ?? []) as FilaAviso[]).map(aAviso);
  },

  async guardarAviso(a: Aviso) {
    const { error } = await servidor().from("avisos").upsert({
      id: a.id,
      texto: a.texto,
      nivel: a.nivel,
      creado_en: new Date(a.creadoEn).toISOString(),
      expira_en: a.expiraEn ? new Date(a.expiraEn).toISOString() : null,
    });
    falla("No se pudo guardar el aviso", error);
  },

  async eliminarAviso(id: string) {
    const { error } = await servidor().from("avisos").delete().eq("id", id);
    falla("No se pudo borrar el aviso", error);
  },

  async listarComercios() {
    const { data, error } = await servidor().from("comercios").select("*").order("nombre");
    falla("No se pudieron leer los comercios", error);
    return ((data ?? []) as FilaComercio[]).map(aComercio);
  },

  async guardarComercio(c: Comercio) {
    const { promoMomento, ...resto } = c;
    const { error } = await servidor()
      .from("comercios")
      .upsert({ ...resto, promo_momento: promoMomento, actualizado_en: new Date().toISOString() });
    falla("No se pudo guardar el comercio", error);
  },

  async eliminarComercio(id: string) {
    const { error } = await servidor().from("comercios").delete().eq("id", id);
    falla("No se pudo borrar el comercio", error);
  },

  async sumarMetrica(comercioId: string, tipo: TipoMetrica) {
    // La suma es atómica dentro de la función SQL: dos toques a la vez cuentan dos.
    const { error } = await servidor().rpc("sumar_metrica", { p_comercio: comercioId, p_tipo: tipo });
    falla("No se pudo contar la métrica", error);
  },

  async leerMetricas() {
    const { data, error } = await servidor().from("comercio_metricas").select("comercio_id, tipo, conteo");
    falla("No se pudieron leer las métricas", error);
    const salida: Record<string, Partial<Record<TipoMetrica, number>>> = {};
    for (const f of (data ?? []) as { comercio_id: string; tipo: TipoMetrica; conteo: number }[]) {
      const m = (salida[f.comercio_id] ??= {});
      m[f.tipo] = (m[f.tipo] ?? 0) + Number(f.conteo);
    }
    return salida;
  },

  async listarReporteros() {
    const { data, error } = await servidor().from("reporteros").select(COLUMNAS_REPORTERO).order("creado_en");
    falla("No se pudieron leer los reporteros", error);
    return ((data ?? []) as FilaReportero[]).map(aReportero);
  },

  async leerReportero(id: string) {
    const { data, error } = await servidor()
      .from("reporteros")
      .select(COLUMNAS_REPORTERO)
      .eq("id", id)
      .maybeSingle();
    falla("No se pudo leer el reportero", error);
    return data ? aReportero(data as FilaReportero) : null;
  },

  async buscarReporteroPorCodigo(codigoHash: string) {
    const { data, error } = await servidor()
      .from("reporteros")
      .select(COLUMNAS_REPORTERO)
      .eq("codigo_hash", codigoHash)
      .eq("activo", true)
      .maybeSingle();
    falla("No se pudo validar el código", error);
    return data ? aReportero(data as FilaReportero) : null;
  },

  async crearReportero(datos: { nombre: string; rol: Rol }, codigoHash: string) {
    const { data, error } = await servidor()
      .from("reporteros")
      .insert({ nombre: datos.nombre, rol: datos.rol, codigo_hash: codigoHash })
      .select(COLUMNAS_REPORTERO)
      .single();
    falla("No se pudo crear el reportero", error);
    return aReportero(data as FilaReportero);
  },

  async actualizarReportero(id, cambios) {
    const fila: Record<string, unknown> = {};
    if (cambios.nombre !== undefined) fila.nombre = cambios.nombre;
    if (cambios.rol !== undefined) fila.rol = cambios.rol;
    if (cambios.activo !== undefined) fila.activo = cambios.activo;
    if (cambios.codigoHash !== undefined) fila.codigo_hash = cambios.codigoHash;
    const { data, error } = await servidor()
      .from("reporteros")
      .update(fila)
      .eq("id", id)
      .select(COLUMNAS_REPORTERO)
      .maybeSingle();
    falla("No se pudo actualizar el reportero", error);
    return data ? aReportero(data as FilaReportero) : null;
  },

  async eliminarReportero(id: string) {
    const { error } = await servidor().from("reporteros").delete().eq("id", id);
    falla("No se pudo borrar el reportero", error);
  },

  async guardarSuscripcion(s: SuscripcionAviso) {
    const { error } = await servidor().from("suscripciones_aviso").upsert({
      endpoint: s.endpoint,
      p256dh: s.p256dh,
      auth: s.auth,
      desfile_id: s.desfileId,
      metros: s.metros,
      umbral_min: s.umbralMin,
    });
    falla("No se pudo guardar la suscripción", error);
  },

  async listarSuscripciones(desfileId: string) {
    const { data, error } = await servidor()
      .from("suscripciones_aviso")
      .select("endpoint, p256dh, auth, desfile_id, metros, umbral_min")
      .eq("desfile_id", desfileId);
    falla("No se pudieron leer las suscripciones", error);
    return (data ?? []).map((f) => ({
      endpoint: f.endpoint as string,
      p256dh: f.p256dh as string,
      auth: f.auth as string,
      desfileId: f.desfile_id as string,
      metros: Number(f.metros),
      umbralMin: Number(f.umbral_min),
    }));
  },

  async eliminarSuscripcion(endpoint: string) {
    const { error } = await servidor().from("suscripciones_aviso").delete().eq("endpoint", endpoint);
    falla("No se pudo borrar la suscripción", error);
  },

  async crearFoto(datos, jpeg: Buffer) {
    const db = servidor();
    const id = crypto.randomUUID();
    const ruta = `${id}.jpg`;
    const subida = await db.storage.from(BUCKET_FOTOS).upload(ruta, jpeg, { contentType: "image/jpeg" });
    falla("No se pudo subir la foto", subida.error);
    const { data, error } = await db
      .from("fotos")
      .insert({ id, desfile_id: datos.desfileId, storage_path: ruta, metros_en_senda: datos.metros })
      .select("*")
      .single();
    falla("No se pudo registrar la foto", error);
    return aFoto(data as FilaFoto);
  },

  async listarFotos(estado) {
    let q = servidor().from("fotos").select("*").order("creado_en", { ascending: false }).limit(300);
    if (estado) q = q.eq("estado", estado);
    const { data, error } = await q;
    falla("No se pudieron leer las fotos", error);
    return ((data ?? []) as FilaFoto[]).map(aFoto);
  },

  async moderarFoto(id: string, estado: Foto["estado"]) {
    const { error } = await servidor().from("fotos").update({ estado }).eq("id", id);
    falla("No se pudo moderar la foto", error);
  },

  async eliminarFoto(id: string) {
    const db = servidor();
    await db.storage.from(BUCKET_FOTOS).remove([`${id}.jpg`]);
    const { error } = await db.from("fotos").delete().eq("id", id);
    falla("No se pudo borrar la foto", error);
  },

  async leerArchivoFoto(id: string) {
    const db = servidor();
    const { data: fila, error } = await db.from("fotos").select("storage_path, estado").eq("id", id).maybeSingle();
    falla("No se pudo leer la foto", error);
    if (!fila) return null;
    const bajada = await db.storage.from(BUCKET_FOTOS).download(fila.storage_path as string);
    if (bajada.error || !bajada.data) return null;
    return { jpeg: Buffer.from(await bajada.data.arrayBuffer()), estado: fila.estado as Foto["estado"] };
  },
};
