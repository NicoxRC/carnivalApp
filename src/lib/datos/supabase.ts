import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { clasificar, VENTANA_DENSIDAD_MS, type Densidad } from "@/lib/densidad";
import { metrosEnSenda, SENDA } from "@/lib/senda";
import {
  MS_VENTANA_HISTORIAL,
  type EntradaPosicion,
  type EstadoDesfile,
  type Posicion,
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ANON_SUPABASE;
  if (!URL_SUPABASE || !key) {
    throw new Error(
      "Falta configurar Supabase. Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local, o usa DATOS=local.",
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

export const adaptadorSupabase: AdaptadorDatos = {
  nombre: "supabase",

  async registrarPosicion(entrada: EntradaPosicion) {
    // La proyección sobre la senda se precalcula aquí, no en la base:
    // así la tabla guarda el número listo y ninguna lectura tiene que recalcularlo.
    const proy = metrosEnSenda(entrada.lat, entrada.lng);
    const { error } = await servidor()
      .from("posiciones")
      .insert({
        desfile_id: entrada.desfileId,
        rol: entrada.rol,
        lat: entrada.lat,
        lng: entrada.lng,
        metros_en_senda: proy.metros,
        precision_m: entrada.precisionM ?? null,
        creado_en: new Date(entrada.ts ?? Date.now()).toISOString(),
      });
    if (error) throw new Error(`No se pudo guardar la posición: ${error.message}`);
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
    const { error } = await servidor().from("desfiles").update({ estado }).eq("id", desfileId);
    if (error) throw new Error(`No se pudo cambiar el estado del desfile: ${error.message}`);
  },
};
