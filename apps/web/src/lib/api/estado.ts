/**
 * El estado del desfile tal como lo manda el backend (`GET /api/state` y cada
 * evento de `/api/state/stream`), traducido al `EstadoDesfile` de la web.
 *
 * El contrato del backend está en inglés (`docs/backend/ARCHITECTURE.md`,
 * nombres en `docs/backend/GLOSSARY.md`); las pantallas siguen con sus tipos
 * en español. Si algo no tiene la forma esperada se lanza un error aquí, y
 * nunca se pinta un estado a medias.
 */

import { deTabla, lista, numero, numeroONulo, objeto, texto } from "@/lib/api/leer";
import { ESTADO_DE_STATE, NIVEL_DE_LEVEL, ROL_DE_POST } from "@/lib/api/valores";
import type { Aviso, EstadoDesfile, MuestraHistorial, Posicion } from "@/lib/tipos";

function posicion(v: unknown, campo: string): Posicion {
  const o = objeto(v, campo);
  return {
    rol: deTabla(ROL_DE_POST, texto(o, "post"), `${campo}.post`),
    lat: numero(o, "lat"),
    lng: numero(o, "lng"),
    metros: numero(o, "metres"),
    precisionM: numeroONulo(o, "accuracyM"),
    ts: numero(o, "ts"),
  };
}

function muestra(v: unknown): MuestraHistorial {
  const o = objeto(v, "headHistory[]");
  return { metros: numero(o, "metres"), ts: numero(o, "ts") };
}

function aviso(v: unknown): Aviso {
  const o = objeto(v, "announcements[]");
  return {
    id: texto(o, "id"),
    texto: texto(o, "text"),
    nivel: deTabla(NIVEL_DE_LEVEL, texto(o, "level"), "announcements[].level"),
    creadoEn: numero(o, "createdAt"),
    expiraEn: numeroONulo(o, "expiresAt"),
  };
}

export function estadoDesdeApi(json: unknown): EstadoDesfile {
  const o = objeto(json, "el estado");
  const posiciones: EstadoDesfile["posiciones"] = {};
  for (const [post, valor] of Object.entries(objeto(o.positions, "positions"))) {
    const p = posicion(valor, `positions.${post}`);
    posiciones[deTabla(ROL_DE_POST, post, "positions")] = p;
  }
  return {
    desfileId: texto(o, "paradeId"),
    nombre: texto(o, "name"),
    estado: deTabla(ESTADO_DE_STATE, texto(o, "state"), "state"),
    fecha: texto(o, "date"),
    horaInicio: texto(o, "startTime"),
    sendaId: texto(o, "courseId"),
    posiciones,
    historialCabeza: lista(o.headHistory, "headHistory").map(muestra),
    avisos: lista(o.announcements, "announcements").map(aviso),
    servidorTs: numero(o, "serverTs"),
  };
}
