import datosComercios from "@/data/comercios-ejemplo.json";
import { clasificar, VENTANA_DENSIDAD_MS, type Densidad } from "@/lib/densidad";
import { metrosEnSenda, SENDA } from "@/lib/senda";
import {
  MS_VENTANA_HISTORIAL,
  type Comercio,
  type EntradaPosicion,
  type EstadoDesfile,
  type Posicion,
  type Reportero,
  type Rol,
} from "@/lib/tipos";
import type { AdaptadorDatos } from "@/lib/datos/adaptador";

/**
 * Store en memoria. Único proceso, sin base de datos.
 * Sobrevive al hot-reload de Next gracias al globalThis; no sobrevive a nada más.
 */

interface RegistroDesfile {
  nombre: string;
  estado: EstadoDesfile["estado"];
  posiciones: Map<Rol, Posicion>;
  historialCabeza: { metros: number; ts: number }[];
}

type Oyente = (estado: EstadoDesfile) => void;

interface StoreGlobal {
  desfiles: Map<string, RegistroDesfile>;
  oyentes: Map<string, Set<Oyente>>;
  /** desfileId -> dispositivoId -> tramo visto. Una entrada por dispositivo. */
  presencias: Map<string, Map<string, { bin: number; ts: number }>>;
  comercios: Map<string, Comercio>;
  /** El hash del código va aparte del reportero: nunca sale en un listado. */
  reporteros: Map<string, { reportero: Reportero; codigoHash: string }>;
}

const g = globalThis as unknown as { __sigueElDesfile?: StoreGlobal };

const store = (g.__sigueElDesfile ??= {
  desfiles: new Map(),
  oyentes: new Map(),
  presencias: new Map(),
} as StoreGlobal);
store.presencias ??= new Map();
store.reporteros ??= new Map();
// Los comercios de ejemplo son el punto de partida en modo local, para que el
// mapa no arranque vacío. Lo que se edite desde el panel vive en memoria.
if (!store.comercios) {
  store.comercios = new Map(
    (datosComercios.comercios as Omit<Comercio, "visible">[]).map((c) => [
      c.id,
      { ...c, visible: true },
    ]),
  );
}

function obtener(desfileId: string): RegistroDesfile {
  let d = store.desfiles.get(desfileId);
  if (!d) {
    d = {
      nombre: "Desfile Magno",
      estado: "programado",
      posiciones: new Map(),
      historialCabeza: [],
    };
    store.desfiles.set(desfileId, d);
  }
  return d;
}

function construirEstado(desfileId: string): EstadoDesfile {
  const d = obtener(desfileId);
  const ahora = Date.now();
  const posiciones: Partial<Record<Rol, Posicion>> = {};
  for (const [rol, pos] of d.posiciones) posiciones[rol] = pos;
  return {
    desfileId,
    nombre: d.nombre,
    estado: d.estado,
    sendaId: SENDA.id,
    posiciones,
    historialCabeza: d.historialCabeza.filter((m) => ahora - m.ts <= MS_VENTANA_HISTORIAL),
    servidorTs: ahora,
  };
}

function notificar(desfileId: string) {
  const set = store.oyentes.get(desfileId);
  if (!set || set.size === 0) return;
  const estado = construirEstado(desfileId);
  for (const cb of set) {
    try {
      cb(estado);
    } catch {
      // Un oyente muerto (conexión cerrada) no puede tumbar la ingesta.
    }
  }
}

export function suscribirLocal(desfileId: string, cb: Oyente): () => void {
  let set = store.oyentes.get(desfileId);
  if (!set) {
    set = new Set();
    store.oyentes.set(desfileId, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

export const adaptadorLocal: AdaptadorDatos = {
  nombre: "local",

  async registrarPosicion(entrada: EntradaPosicion, reporteroId?: string) {
    const d = obtener(entrada.desfileId);
    const ts = entrada.ts ?? Date.now();
    const proy = metrosEnSenda(entrada.lat, entrada.lng);

    const pos: Posicion = {
      rol: entrada.rol,
      lat: entrada.lat,
      lng: entrada.lng,
      metros: proy.metros,
      precisionM: entrada.precisionM ?? null,
      ts,
    };

    const anterior = d.posiciones.get(entrada.rol);
    // Un paquete viejo que llega tarde no debe pisar uno más nuevo.
    if (!anterior || ts >= anterior.ts) {
      d.posiciones.set(entrada.rol, pos);
    }

    if (entrada.rol === "cabeza") {
      d.historialCabeza.push({ metros: proy.metros, ts });
      d.historialCabeza.sort((a, b) => a.ts - b.ts);
      const corte = ts - MS_VENTANA_HISTORIAL;
      d.historialCabeza = d.historialCabeza.filter((m) => m.ts >= corte);
    }

    if (d.estado === "programado") d.estado = "en_curso";

    if (reporteroId) {
      const r = store.reporteros.get(reporteroId);
      if (r) r.reportero.ultimaSenalTs = Math.max(r.reportero.ultimaSenalTs ?? 0, ts);
    }

    notificar(entrada.desfileId);
  },

  async leerEstado(desfileId: string) {
    return construirEstado(desfileId);
  },

  async registrarPresencia(desfileId: string, dispositivoId: string, bin: number) {
    let mapa = store.presencias.get(desfileId);
    if (!mapa) {
      mapa = new Map();
      store.presencias.set(desfileId, mapa);
    }
    // Una entrada por dispositivo: reportar más seguido no infla el conteo.
    mapa.set(dispositivoId, { bin, ts: Date.now() });
  },

  async leerDensidad(desfileId: string): Promise<Densidad> {
    const mapa = store.presencias.get(desfileId);
    const conteos = new Map<number, number>();
    if (!mapa) return clasificar(conteos, 0);

    const corte = Date.now() - VENTANA_DENSIDAD_MS;
    let total = 0;
    for (const [id, p] of mapa) {
      if (p.ts < corte) {
        mapa.delete(id); // se poda al leer: no hace falta un temporizador
        continue;
      }
      total++;
      conteos.set(p.bin, (conteos.get(p.bin) ?? 0) + 1);
    }
    return clasificar(conteos, total);
  },

  async fijarEstadoDesfile(desfileId: string, estado: EstadoDesfile["estado"]) {
    const d = obtener(desfileId);
    d.estado = estado;
    if (estado === "programado") {
      d.posiciones.clear();
      d.historialCabeza = [];
    }
    notificar(desfileId);
  },

  async listarComercios() {
    return [...store.comercios.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  },

  async guardarComercio(comercio: Comercio) {
    store.comercios.set(comercio.id, comercio);
  },

  async eliminarComercio(id: string) {
    store.comercios.delete(id);
  },

  async listarReporteros() {
    return [...store.reporteros.values()]
      .map((r) => ({ ...r.reportero }))
      .sort((a, b) => a.creadoEn - b.creadoEn);
  },

  async leerReportero(id: string) {
    const r = store.reporteros.get(id);
    return r ? { ...r.reportero } : null;
  },

  async buscarReporteroPorCodigo(codigoHash: string) {
    for (const r of store.reporteros.values()) {
      if (r.codigoHash === codigoHash && r.reportero.activo) return { ...r.reportero };
    }
    return null;
  },

  async crearReportero(datos: { nombre: string; rol: Rol }, codigoHash: string) {
    const reportero: Reportero = {
      id: crypto.randomUUID(),
      nombre: datos.nombre,
      rol: datos.rol,
      activo: true,
      ultimaSenalTs: null,
      creadoEn: Date.now(),
    };
    store.reporteros.set(reportero.id, { reportero, codigoHash });
    return { ...reportero };
  },

  async actualizarReportero(id, cambios) {
    const r = store.reporteros.get(id);
    if (!r) return null;
    if (cambios.nombre !== undefined) r.reportero.nombre = cambios.nombre;
    if (cambios.rol !== undefined) r.reportero.rol = cambios.rol;
    if (cambios.activo !== undefined) r.reportero.activo = cambios.activo;
    if (cambios.codigoHash !== undefined) r.codigoHash = cambios.codigoHash;
    return { ...r.reportero };
  },

  async eliminarReportero(id: string) {
    store.reporteros.delete(id);
  },
};

/** Solo lo usa el simulador interno para saber si ya hay algo corriendo. */
export function estadoCrudo(desfileId: string) {
  return obtener(desfileId);
}
