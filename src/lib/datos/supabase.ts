import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { clasificar, VENTANA_DENSIDAD_MS, type Densidad } from "@/lib/densidad";
import { metrosEnSenda, SENDA } from "@/lib/senda";
import {
  MS_VENTANA_HISTORIAL,
  type CategoriaComercio,
  type Comercio,
  type EntradaPosicion,
  type EstadoDesfile,
  type PlanComercio,
  type Posicion,
  type Reportero,
  type Rol,
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

interface FilaComercio {
  id: string;
  nombre: string;
  categoria: CategoriaComercio;
  descripcion: string | null;
  direccion: string | null;
  horario: string | null;
  lat: number;
  lng: number;
  plan: PlanComercio | null;
  promo: string | null;
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

/** Un error de la base no puede quedar en silencio: la UI mostraría "sin reportes" en vez de "sin conexión". */
function falla(que: string, error: { message: string } | null) {
  if (error) throw new Error(`${que}: ${error.message}`);
}

export const adaptadorSupabase: AdaptadorDatos = {
  nombre: "supabase",

  async registrarPosicion(entrada: EntradaPosicion, reporteroId?: string) {
    // La proyección sobre la senda se precalcula aquí, no en la base:
    // así la tabla guarda el número listo y ninguna lectura tiene que recalcularlo.
    const proy = metrosEnSenda(entrada.lat, entrada.lng);
    const db = servidor();
    const { error } = await db
      .from("posiciones")
      .insert({
        desfile_id: entrada.desfileId,
        reportero_id: reporteroId ?? null,
        rol: entrada.rol,
        lat: entrada.lat,
        lng: entrada.lng,
        metros_en_senda: proy.metros,
        precision_m: entrada.precisionM ?? null,
        creado_en: new Date(entrada.ts ?? Date.now()).toISOString(),
      });
    if (error) throw new Error(`No se pudo guardar la posición: ${error.message}`);

    // Igual que el adaptador local: la primera posición arranca el desfile.
    // Estas dos escrituras son secundarias: si fallan, la posición ya quedó.
    const ts = new Date(entrada.ts ?? Date.now()).toISOString();
    await Promise.all([
      db
        .from("desfiles")
        .update({ estado: "en_curso" })
        .eq("id", entrada.desfileId)
        .eq("estado", "programado"),
      reporteroId
        ? db.from("reporteros").update({ ultima_senal: ts }).eq("id", reporteroId)
        : Promise.resolve(),
    ]);
  },

  async leerEstado(desfileId: string): Promise<EstadoDesfile> {
    const db = servidor();
    const desde = new Date(Date.now() - MS_VENTANA_HISTORIAL).toISOString();

    const [desfile, ultimas, historial] = await Promise.all([
      db.from("desfiles").select("nombre, estado, senda_id").eq("id", desfileId).maybeSingle(),
      db.from("ultimas_posiciones").select("*").eq("desfile_id", desfileId),
      db
        .from("posiciones")
        .select("metros_en_senda, creado_en")
        .eq("desfile_id", desfileId)
        .eq("rol", "cabeza")
        .gte("creado_en", desde)
        .order("creado_en", { ascending: true }),
    ]);

    falla("No se pudo leer el desfile", desfile.error);
    falla("No se pudieron leer las posiciones", ultimas.error);
    falla("No se pudo leer el historial", historial.error);

    const posiciones: Partial<Record<Rol, Posicion>> = {};
    for (const fila of (ultimas.data ?? []) as FilaPosicion[]) {
      posiciones[fila.rol] = aPosicion(fila);
    }

    return {
      desfileId,
      nombre: desfile.data?.nombre ?? "Desfile",
      estado: (desfile.data?.estado as EstadoDesfile["estado"]) ?? "programado",
      sendaId: desfile.data?.senda_id ?? SENDA.id,
      posiciones,
      historialCabeza: (historial.data ?? []).map((f) => ({
        metros: Number(f.metros_en_senda),
        ts: new Date(f.creado_en as string).getTime(),
      })),
      servidorTs: Date.now(),
    };
  },

  async registrarPresencia(desfileId: string, dispositivoId: string, bin: number) {
    // upsert por (desfile, dispositivo): una fila por celular, no un historial.
    // No se guarda dónde estuvo antes: solo dónde está ahora.
    const { error } = await servidor()
      .from("presencias")
      .upsert(
        {
          desfile_id: desfileId,
          dispositivo_id: dispositivoId,
          bin,
          visto_en: new Date().toISOString(),
        },
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

  async listarComercios() {
    const { data, error } = await servidor().from("comercios").select("*").order("nombre");
    falla("No se pudieron leer los comercios", error);
    return ((data ?? []) as FilaComercio[]).map(aComercio);
  },

  async guardarComercio(c: Comercio) {
    const { error } = await servidor()
      .from("comercios")
      .upsert({ ...c, actualizado_en: new Date().toISOString() });
    falla("No se pudo guardar el comercio", error);
  },

  async eliminarComercio(id: string) {
    const { error } = await servidor().from("comercios").delete().eq("id", id);
    falla("No se pudo borrar el comercio", error);
  },

  async listarReporteros() {
    const { data, error } = await servidor()
      .from("reporteros")
      .select(COLUMNAS_REPORTERO)
      .order("creado_en");
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
};
