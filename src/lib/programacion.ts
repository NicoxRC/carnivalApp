import { ES_FECHA, ES_HORA, normalizarHora } from "@/lib/fecha";
import type { Aviso, CategoriaEvento, Desfile, Evento } from "@/lib/tipos";

/** Validación de lo que manda el panel: desfiles, eventos y avisos. */

export const CATEGORIAS_EVENTO: Record<CategoriaEvento, string> = {
  presentacion: "Tarima / presentación",
  tasca: "Tasca",
  cultural: "Cultural",
  infantil: "Infantil",
};

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function fechaYHora(o: Record<string, unknown>): { fecha: string; horaInicio: string } | { error: string } {
  const fecha = texto(o.fecha, 10);
  const hora = texto(o.horaInicio, 5);
  if (!ES_FECHA.test(fecha)) return { error: "Falta la fecha." };
  if (!ES_HORA.test(hora)) return { error: "Falta la hora de inicio." };
  return { fecha, horaInicio: normalizarHora(hora) };
}

export function validarDesfile(cuerpo: unknown, id: string): { desfile: Omit<Desfile, "estado"> } | { error: string } {
  if (typeof cuerpo !== "object" || cuerpo === null) return { error: "Datos inválidos." };
  const o = cuerpo as Record<string, unknown>;
  const nombre = texto(o.nombre, 80);
  if (!nombre) return { error: "Falta el nombre." };
  const fh = fechaYHora(o);
  if ("error" in fh) return fh;
  return { desfile: { id, nombre, ...fh } };
}

export function validarEvento(cuerpo: unknown, id: string): { evento: Evento } | { error: string } {
  if (typeof cuerpo !== "object" || cuerpo === null) return { error: "Datos inválidos." };
  const o = cuerpo as Record<string, unknown>;
  const titulo = texto(o.titulo, 100);
  if (!titulo) return { error: "Falta el título." };
  const fh = fechaYHora(o);
  if ("error" in fh) return fh;
  const fin = texto(o.horaFin, 5);
  if (fin && !ES_HORA.test(fin)) return { error: "Hora de fin inválida." };
  const categoria = String(o.categoria) as CategoriaEvento;
  if (!(categoria in CATEGORIAS_EVENTO)) return { error: "Categoría inválida." };

  const conPunto = o.lat !== null && o.lat !== undefined && o.lng !== null && o.lng !== undefined;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  if (conPunto && (!Number.isFinite(lat) || !Number.isFinite(lng))) return { error: "Punto inválido." };

  return {
    evento: {
      id,
      ...fh,
      horaFin: fin ? normalizarHora(fin) : null,
      titulo,
      descripcion: texto(o.descripcion, 280),
      categoria,
      lugarNombre: texto(o.lugarNombre, 100),
      lat: conPunto ? lat : null,
      lng: conPunto ? lng : null,
      patrocinado: o.patrocinado === true,
    },
  };
}

/** Un aviso sin vencimiento se queda arriba del mapa hasta que alguien se acuerde de quitarlo: tope de 12 h. */
const DURACION_MAX_MIN = 12 * 60;

export function validarAviso(cuerpo: unknown, id: string): { aviso: Aviso } | { error: string } {
  if (typeof cuerpo !== "object" || cuerpo === null) return { error: "Datos inválidos." };
  const o = cuerpo as Record<string, unknown>;
  const t = texto(o.texto, 160);
  if (!t) return { error: "Escribí el mensaje." };
  const minutos = Math.min(Math.max(Number(o.duracionMin) || 60, 5), DURACION_MAX_MIN);
  const ahora = Date.now();
  return {
    aviso: {
      id,
      texto: t,
      nivel: o.nivel === "alerta" ? "alerta" : "info",
      creadoEn: ahora,
      expiraEn: ahora + minutos * 60_000,
    },
  };
}
