import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import datosComercios from "@/data/comercios-ejemplo.json";
import datosDesfiles from "@/data/desfiles-ejemplo.json";
import datosEventos from "@/data/eventos-ejemplo.json";
import { clasificar, VENTANA_DENSIDAD_MS, type Densidad } from "@/lib/densidad";
import { normalizarHora } from "@/lib/fecha";
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
 * Store en memoria, con copia en disco de lo que se edita desde el panel.
 *
 * Dos clases de datos, tratadas distinto a propósito:
 *  - Lo EN VIVO (posiciones, gentío, suscripciones) vive solo en memoria:
 *    sobrevive al hot-reload de Next gracias al globalThis y a nada más.
 *  - Lo EDITADO (desfiles, eventos, comercios, reporteros, avisos, fotos) se
 *    copia a `.datos-local/`, para que reiniciar `npm run dev` no borre una
 *    tarde de cargar comercios ni invalide los códigos de los reporteros.
 */

interface EnVivo {
  posiciones: Map<Rol, Posicion & { reporteroId: string | null }>;
  historialCabeza: MuestraHistorial[];
  /** Todo el recorrido de la cabeza, sin recortar a la ventana. */
  recorrido: MuestraHistorial[];
}

type Oyente = (estado: EstadoDesfile) => void;

interface Persistido {
  desfiles: Desfile[];
  eventos: Evento[];
  avisos: Aviso[];
  comercios: Comercio[];
  reporteros: { reportero: Reportero; codigoHash: string }[];
  metricas: Record<string, Partial<Record<TipoMetrica, number>>>;
  fotos: Omit<Foto, "url">[];
}

interface StoreGlobal {
  cargado: boolean;
  datos: Persistido;
  enVivo: Map<string, EnVivo>;
  oyentes: Map<string, Set<Oyente>>;
  /** desfileId -> dispositivoId -> tramo visto. Una entrada por dispositivo. */
  presencias: Map<string, Map<string, { bin: number; ts: number }>>;
  suscripciones: Map<string, SuscripcionAviso>;
  guardado: NodeJS.Timeout | null;
}

const g = globalThis as unknown as { __sigueElDesfile2?: StoreGlobal };

const store = (g.__sigueElDesfile2 ??= {
  cargado: false,
  datos: { desfiles: [], eventos: [], avisos: [], comercios: [], reporteros: [], metricas: {}, fotos: [] },
  enVivo: new Map(),
  oyentes: new Map(),
  presencias: new Map(),
  suscripciones: new Map(),
  guardado: null,
});

/* ------------------------------- Persistencia ------------------------------ */

const CARPETA = join(process.cwd(), ".datos-local");
const ARCHIVO = join(CARPETA, "datos.json");
const CARPETA_FOTOS = join(CARPETA, "fotos");

/** Los datos de ejemplo son el punto de partida, para que la app no arranque vacía. */
function semilla(): Persistido {
  const desfiles: Desfile[] = [];
  const eventos: Evento[] = [];

  for (const dia of datosDesfiles.dias) {
    for (const e of dia.eventos) {
      const hora = normalizarHora(e.hora);
      if (e.esDesfile) {
        desfiles.push({ id: e.id, nombre: e.titulo, fecha: dia.fecha, horaInicio: hora, estado: "programado" });
      } else {
        eventos.push({
          id: e.id,
          fecha: dia.fecha,
          horaInicio: hora,
          horaFin: null,
          titulo: e.titulo,
          descripcion: "",
          categoria: "cultural",
          lugarNombre: e.lugar,
          lat: null,
          lng: null,
          patrocinado: false,
        });
      }
    }
  }
  for (const e of datosEventos.eventos) {
    eventos.push({ ...(e as Omit<Evento, "fecha">), fecha: datosEventos.fecha });
  }

  return {
    desfiles,
    eventos,
    avisos: [],
    comercios: (datosComercios.comercios as Partial<Comercio>[]).map(completarComercio),
    reporteros: [],
    metricas: {},
    fotos: [],
  };
}

/** Rellena los campos que no existían cuando se guardó el comercio. */
function completarComercio(c: Partial<Comercio>): Comercio {
  return {
    promoMomento: "siempre",
    menu: [],
    whatsapp: null,
    enlace: null,
    visible: true,
    ...c,
  } as Comercio;
}

function cargar() {
  if (store.cargado) return;
  store.cargado = true;
  try {
    if (existsSync(ARCHIVO)) {
      const leido = JSON.parse(readFileSync(ARCHIVO, "utf8")) as Partial<Persistido>;
      store.datos = { ...semilla(), ...leido };
      store.datos.comercios = store.datos.comercios.map(completarComercio);
      return;
    }
  } catch (e) {
    console.error("[datos-local] no se pudo leer la copia en disco; se arranca de los ejemplos:", e);
  }
  store.datos = semilla();
}

/** Se escribe con un pequeño retraso para juntar varias ediciones seguidas. */
function persistir() {
  if (store.guardado) return;
  store.guardado = setTimeout(() => {
    store.guardado = null;
    try {
      mkdirSync(CARPETA, { recursive: true });
      writeFileSync(ARCHIVO, JSON.stringify(store.datos, null, 2));
    } catch {
      // Disco de solo lectura (serverless): el modo local ahí no sirve de todas formas.
    }
  }, 200);
}

function db(): Persistido {
  cargar();
  return store.datos;
}

/* --------------------------------- En vivo -------------------------------- */

function vivo(desfileId: string): EnVivo {
  let v = store.enVivo.get(desfileId);
  if (!v) {
    v = { posiciones: new Map(), historialCabeza: [], recorrido: [] };
    store.enVivo.set(desfileId, v);
  }
  return v;
}

function avisosVigentes(): Aviso[] {
  const ahora = Date.now();
  return db().avisos.filter((a) => a.expiraEn === null || a.expiraEn > ahora);
}

function construirEstado(d: Desfile): EstadoDesfile {
  const v = vivo(d.id);
  const ahora = Date.now();
  const posiciones: Partial<Record<Rol, Posicion>> = {};
  for (const [rol, { reporteroId: _quien, ...pos }] of v.posiciones) posiciones[rol] = pos;
  return {
    desfileId: d.id,
    nombre: d.nombre,
    estado: d.estado,
    fecha: d.fecha,
    horaInicio: d.horaInicio,
    sendaId: SENDA.id,
    posiciones,
    historialCabeza: v.historialCabeza.filter((m) => ahora - m.ts <= MS_VENTANA_HISTORIAL),
    avisos: avisosVigentes(),
    servidorTs: ahora,
  };
}

function notificar(desfileId: string) {
  const set = store.oyentes.get(desfileId);
  if (!set || set.size === 0) return;
  const d = db().desfiles.find((x) => x.id === desfileId);
  if (!d) return;
  const estado = construirEstado(d);
  for (const cb of set) {
    try {
      cb(estado);
    } catch {
      // Un oyente muerto (conexión cerrada) no puede tumbar la ingesta.
    }
  }
}

/** Un aviso nuevo le llega a todo el que esté mirando cualquier desfile. */
function notificarATodos() {
  for (const id of store.oyentes.keys()) notificar(id);
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

const conUrl = (f: Omit<Foto, "url">): Foto => ({ ...f, url: `/api/fotos/${f.id}` });

/** El recorrido completo de un desfile de 5 h a un punto cada 3 s cabe de sobra. */
const MAX_RECORRIDO = 8000;

export const adaptadorLocal: AdaptadorDatos = {
  nombre: "local",

  async registrarPosiciones(entradas: EntradaPosicion[], reporteroId?: string) {
    if (entradas.length === 0) return;
    const desfileId = entradas[0].desfileId;
    const d = db().desfiles.find((x) => x.id === desfileId);
    if (!d) throw new Error("Ese desfile no existe.");
    const v = vivo(desfileId);

    for (const entrada of entradas) {
      const ts = entrada.ts ?? Date.now();
      const proy = metrosEnSenda(entrada.lat, entrada.lng);
      const anterior = v.posiciones.get(entrada.rol);
      // Un paquete viejo que llega tarde no debe pisar uno más nuevo.
      if (!anterior || ts >= anterior.ts) {
        v.posiciones.set(entrada.rol, {
          rol: entrada.rol,
          lat: entrada.lat,
          lng: entrada.lng,
          metros: proy.metros,
          precisionM: entrada.precisionM ?? null,
          ts,
          reporteroId: reporteroId ?? null,
        });
      }
      if (entrada.rol === "cabeza") {
        v.historialCabeza.push({ metros: proy.metros, ts });
        v.recorrido.push({ metros: proy.metros, ts });
      }
    }

    const ultimoTs = Math.max(...entradas.map((e) => e.ts ?? Date.now()));
    v.historialCabeza.sort((a, b) => a.ts - b.ts);
    v.historialCabeza = v.historialCabeza.filter((m) => m.ts >= ultimoTs - MS_VENTANA_HISTORIAL);
    if (v.recorrido.length > MAX_RECORRIDO) v.recorrido = v.recorrido.slice(-MAX_RECORRIDO);

    if (d.estado === "programado") {
      d.estado = "en_curso";
      persistir();
    }
    if (reporteroId) {
      const r = db().reporteros.find((x) => x.reportero.id === reporteroId);
      if (r) {
        r.reportero.ultimaSenalTs = Math.max(r.reportero.ultimaSenalTs ?? 0, ultimoTs);
        persistir();
      }
    }

    notificar(desfileId);
  },

  async leerEstado(desfileId: string) {
    const d = db().desfiles.find((x) => x.id === desfileId);
    return d ? construirEstado(d) : null;
  },

  async fijarEstadoDesfile(desfileId: string, estado: EstadoDesfile["estado"]) {
    const d = db().desfiles.find((x) => x.id === desfileId);
    if (!d) throw new Error("Ese desfile no existe.");
    d.estado = estado;
    if (estado === "programado") store.enVivo.delete(desfileId);
    persistir();
    notificar(desfileId);
  },

  async ultimoEmisor(desfileId: string, rol: Rol) {
    const p = store.enVivo.get(desfileId)?.posiciones.get(rol);
    return p ? { reporteroId: p.reporteroId, ts: p.ts } : null;
  },

  async leerRecorrido(desfileId: string) {
    return [...(store.enVivo.get(desfileId)?.recorrido ?? [])].sort((a, b) => a.ts - b.ts);
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

  async listarDesfiles() {
    return db().desfiles.map((d) => ({ ...d }));
  },

  async guardarDesfile(d) {
    const existente = db().desfiles.find((x) => x.id === d.id);
    if (existente) Object.assign(existente, d);
    else db().desfiles.push({ ...d, estado: "programado" });
    persistir();
    notificar(d.id);
  },

  async eliminarDesfile(id: string) {
    db().desfiles = db().desfiles.filter((d) => d.id !== id);
    store.enVivo.delete(id);
    store.presencias.delete(id);
    persistir();
  },

  async listarEventos() {
    return db().eventos.map((e) => ({ ...e }));
  },

  async guardarEvento(e: Evento) {
    db().eventos = [...db().eventos.filter((x) => x.id !== e.id), e];
    persistir();
  },

  async eliminarEvento(id: string) {
    db().eventos = db().eventos.filter((e) => e.id !== id);
    persistir();
  },

  async listarAvisos() {
    return avisosVigentes();
  },

  async guardarAviso(a: Aviso) {
    db().avisos = [...avisosVigentes().filter((x) => x.id !== a.id), a];
    persistir();
    notificarATodos();
  },

  async eliminarAviso(id: string) {
    db().avisos = db().avisos.filter((a) => a.id !== id);
    persistir();
    notificarATodos();
  },

  async listarComercios() {
    return [...db().comercios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  },

  async guardarComercio(comercio: Comercio) {
    db().comercios = [...db().comercios.filter((c) => c.id !== comercio.id), comercio];
    persistir();
  },

  async eliminarComercio(id: string) {
    db().comercios = db().comercios.filter((c) => c.id !== id);
    delete db().metricas[id];
    persistir();
  },

  async sumarMetrica(comercioId: string, tipo: TipoMetrica) {
    if (!db().comercios.some((c) => c.id === comercioId)) return;
    const m = (db().metricas[comercioId] ??= {});
    m[tipo] = (m[tipo] ?? 0) + 1;
    persistir();
  },

  async leerMetricas() {
    return structuredClone(db().metricas);
  },

  async listarReporteros() {
    return db()
      .reporteros.map((r) => ({ ...r.reportero }))
      .sort((a, b) => a.creadoEn - b.creadoEn);
  },

  async leerReportero(id: string) {
    const r = db().reporteros.find((x) => x.reportero.id === id);
    return r ? { ...r.reportero } : null;
  },

  async buscarReporteroPorCodigo(codigoHash: string) {
    const r = db().reporteros.find((x) => x.codigoHash === codigoHash && x.reportero.activo);
    return r ? { ...r.reportero } : null;
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
    db().reporteros.push({ reportero, codigoHash });
    persistir();
    return { ...reportero };
  },

  async actualizarReportero(id, cambios) {
    const r = db().reporteros.find((x) => x.reportero.id === id);
    if (!r) return null;
    if (cambios.nombre !== undefined) r.reportero.nombre = cambios.nombre;
    if (cambios.rol !== undefined) r.reportero.rol = cambios.rol;
    if (cambios.activo !== undefined) r.reportero.activo = cambios.activo;
    if (cambios.codigoHash !== undefined) r.codigoHash = cambios.codigoHash;
    persistir();
    return { ...r.reportero };
  },

  async eliminarReportero(id: string) {
    db().reporteros = db().reporteros.filter((r) => r.reportero.id !== id);
    persistir();
  },

  async guardarSuscripcion(s: SuscripcionAviso) {
    store.suscripciones.set(s.endpoint, s);
  },

  async listarSuscripciones(desfileId: string) {
    return [...store.suscripciones.values()].filter((s) => s.desfileId === desfileId);
  },

  async eliminarSuscripcion(endpoint: string) {
    store.suscripciones.delete(endpoint);
  },

  async crearFoto(datos, jpeg: Buffer) {
    const foto: Omit<Foto, "url"> = {
      id: crypto.randomUUID(),
      desfileId: datos.desfileId,
      metros: datos.metros,
      estado: "pendiente",
      creadoEn: Date.now(),
    };
    mkdirSync(CARPETA_FOTOS, { recursive: true });
    writeFileSync(join(CARPETA_FOTOS, `${foto.id}.jpg`), jpeg);
    db().fotos.push(foto);
    persistir();
    return conUrl(foto);
  },

  async listarFotos(estado) {
    return db()
      .fotos.filter((f) => !estado || f.estado === estado)
      .sort((a, b) => b.creadoEn - a.creadoEn)
      .map(conUrl);
  },

  async moderarFoto(id: string, estado: Foto["estado"]) {
    const f = db().fotos.find((x) => x.id === id);
    if (f) {
      f.estado = estado;
      persistir();
    }
  },

  async eliminarFoto(id: string) {
    db().fotos = db().fotos.filter((f) => f.id !== id);
    rmSync(join(CARPETA_FOTOS, `${id}.jpg`), { force: true });
    persistir();
  },

  async leerArchivoFoto(id: string) {
    const f = db().fotos.find((x) => x.id === id);
    // El id es un uuid generado aquí: no puede traer "../".
    const ruta = join(CARPETA_FOTOS, `${id}.jpg`);
    if (!f || !existsSync(ruta)) return null;
    return { jpeg: readFileSync(ruta), estado: f.estado };
  },
};
