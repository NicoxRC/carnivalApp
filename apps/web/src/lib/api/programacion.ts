/**
 * La programación (`GET /api/schedule`) y el recorrido de un desfile
 * (`GET /api/parades/{id}/progress`), traducidos a los tipos de la web.
 *
 * Un desfile o un evento con un valor desconocido se descarta solo; si falta
 * la estructura (por ejemplo `parades` no es una lista), falla todo.
 */

import { deTabla, lista, numero, numeroONulo, objeto, sinLosInvalidos, texto, textoONulo, booleano } from "@/lib/api/leer";
import { CATEGORIA_DE_EVENTO, ESTADO_DE_STATE } from "@/lib/api/valores";
import type { PasoPorHito } from "@/lib/recorrido";
import type { Desfile, Evento } from "@/lib/tipos";

export interface Programacion {
  desfiles: Desfile[];
  eventos: Evento[];
  /** YYYY-MM-DD de hoy en Pasto, según el servidor. */
  hoy: string;
  actualId: string | null;
}

function desfile(v: unknown): Desfile {
  const o = objeto(v, "parades[]");
  return {
    id: texto(o, "id"),
    nombre: texto(o, "name"),
    fecha: texto(o, "date"),
    horaInicio: texto(o, "startTime"),
    estado: deTabla(ESTADO_DE_STATE, texto(o, "state"), "parades[].state"),
  };
}

function evento(v: unknown): Evento {
  const o = objeto(v, "events[]");
  return {
    id: texto(o, "id"),
    fecha: texto(o, "date"),
    horaInicio: texto(o, "startTime"),
    horaFin: textoONulo(o, "endTime"),
    titulo: texto(o, "title"),
    descripcion: texto(o, "description"),
    categoria: deTabla(CATEGORIA_DE_EVENTO, texto(o, "category"), "events[].category"),
    lugarNombre: texto(o, "placeName"),
    lat: numeroONulo(o, "lat"),
    lng: numeroONulo(o, "lng"),
    patrocinado: booleano(o, "sponsored"),
  };
}

export function programacionDesdeApi(json: unknown): Programacion {
  const o = objeto(json, "la programación");
  return {
    desfiles: sinLosInvalidos(lista(o.parades, "parades"), desfile, "un desfile"),
    eventos: sinLosInvalidos(lista(o.events, "events"), evento, "un evento"),
    hoy: texto(o, "today"),
    actualId: textoONulo(o, "currentId"),
  };
}

function paso(v: unknown): PasoPorHito {
  const o = objeto(v, "passes[]");
  return {
    hitoId: texto(o, "waypointId"),
    nombre: texto(o, "name"),
    metros: numero(o, "metres"),
    ts: numeroONulo(o, "ts"),
  };
}

/** Solo los pasos: el desfile que viene al lado ya está en la programación. */
export function recorridoDesdeApi(json: unknown): PasoPorHito[] {
  return lista(objeto(json, "el recorrido").passes, "passes").map(paso);
}
