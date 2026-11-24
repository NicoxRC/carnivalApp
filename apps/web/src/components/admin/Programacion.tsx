"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { api, BotonPrimario, BotonSec, Campo, ENTRADA, TARJETA } from "@/components/admin/comun";
import { partesDeFecha } from "@/lib/fecha";
import { CATEGORIAS_EVENTO } from "@/lib/programacion";
import type { CategoriaEvento, Desfile, Evento } from "@/lib/tipos";

const MapaSelector = dynamic(() => import("@/components/admin/MapaSelector"), {
  ssr: false,
  loading: () => <div className="h-72 w-full rounded-2xl bg-papel-2" />,
});

const ESTADO = { programado: "Programado", en_curso: "En curso", finalizado: "Finalizado" } as const;

type BorradorDesfile = { id: string | null; nombre: string; fecha: string; horaInicio: string };
type BorradorEvento = Omit<Evento, "id"> & { id: string | null };

const EVENTO_VACIO: BorradorEvento = {
  id: null,
  fecha: "",
  horaInicio: "",
  horaFin: null,
  titulo: "",
  descripcion: "",
  categoria: "presentacion",
  lugarNombre: "",
  lat: null,
  lng: null,
  patrocinado: false,
};

/**
 * La programación: los desfiles de cada día (los que la app sigue en vivo) y
 * los demás eventos. Lo que se edite aquí es lo que ven «Hoy» y «Desfiles».
 */
export function Programacion({ onVencida }: { onVencida: () => void }) {
  const [desfiles, setDesfiles] = useState<Desfile[] | null>(null);
  const [actualId, setActualId] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desfile, setDesfile] = useState<BorradorDesfile | null>(null);
  const [evento, setEvento] = useState<BorradorEvento | null>(null);

  const recargar = useCallback(async () => {
    const [d, e] = await Promise.all([
      api<{ desfiles: Desfile[]; actualId: string | null }>("/api/admin/desfiles"),
      api<{ eventos: Evento[] }>("/api/admin/eventos"),
    ]);
    if (!d.ok || !e.ok) {
      const fallo = !d.ok ? d : (e as Exclude<typeof e, { ok: true }>);
      if (fallo.status === 401) onVencida();
      else setError(fallo.error);
      return;
    }
    setDesfiles([...d.datos.desfiles].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio)));
    setActualId(d.datos.actualId);
    setEventos([...e.datos.eventos].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio)));
  }, [onVencida]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const enviar = async (url: string, method: string, cuerpo?: unknown) => {
    const r = await api(url, { method, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    if (!r.ok) {
      if (r.status === 401) onVencida();
      setError(r.error);
      return false;
    }
    setError(null);
    void recargar();
    return true;
  };

  const guardarDesfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desfile) return;
    const ok = await enviar(desfile.id ? `/api/admin/desfiles/${desfile.id}` : "/api/admin/desfiles", desfile.id ? "PUT" : "POST", desfile);
    if (ok) setDesfile(null);
  };

  const guardarEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evento) return;
    const ok = await enviar(evento.id ? `/api/admin/eventos/${evento.id}` : "/api/admin/eventos", evento.id ? "PUT" : "POST", evento);
    if (ok) setEvento(null);
  };

  const accion = async (d: Desfile, a: "iniciar" | "finalizar" | "reiniciar") => {
    if (a === "reiniciar" && !confirm(`¿Reiniciar «${d.nombre}»? Se borran todas sus posiciones.`)) return;
    await enviar(`/api/admin/desfiles/${d.id}`, "PATCH", { accion: a });
  };

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm font-semibold text-alerta">{error}</p> : null}

      {/* ------------------------------- Desfiles ------------------------------ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="fuente-display text-[20px] text-tinta">Desfiles</h2>
          <BotonSec onClick={() => setDesfile({ id: null, nombre: "", fecha: "", horaInicio: "09:00" })}>
            Agregar desfile
          </BotonSec>
        </div>
        <p className="text-[13px] text-tinta-3">
          La app sigue un desfile a la vez: el que está en curso; si no hay, el de hoy; si no, el
          próximo. Ese es el que ve el público y en el que escriben los reporteros.
        </p>

        {desfile && (
          <form onSubmit={guardarDesfile} className={`${TARJETA} flex flex-wrap items-end gap-3`}>
            <div className="min-w-56 flex-1">
              <Campo etiqueta="Nombre">
                <input value={desfile.nombre} onChange={(e) => setDesfile({ ...desfile, nombre: e.target.value })} className={ENTRADA} required />
              </Campo>
            </div>
            <Campo etiqueta="Fecha">
              <input type="date" value={desfile.fecha} onChange={(e) => setDesfile({ ...desfile, fecha: e.target.value })} className={ENTRADA} required />
            </Campo>
            <Campo etiqueta="Hora de salida">
              <input type="time" value={desfile.horaInicio} onChange={(e) => setDesfile({ ...desfile, horaInicio: e.target.value })} className={ENTRADA} required />
            </Campo>
            <BotonPrimario>Guardar</BotonPrimario>
            <BotonSec onClick={() => setDesfile(null)}>Cancelar</BotonSec>
          </form>
        )}

        <div className={`${TARJETA} overflow-hidden p-0`}>
          {desfiles === null ? (
            <p className="p-5 text-sm text-tinta-3">Cargando…</p>
          ) : desfiles.length === 0 ? (
            <p className="p-5 text-sm text-tinta-3">No hay desfiles. Sin al menos uno, el mapa no tiene qué seguir.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {desfiles.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-5 py-3.5">
                  <div className="min-w-48 flex-1">
                    <p className="font-bold text-tinta">
                      {d.nombre}
                      {d.id === actualId && (
                        <span className="ml-2 rounded bg-cabeza px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-white">
                          EL QUE VE EL PÚBLICO
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-tinta-3">
                      {partesDeFecha(d.fecha).diaCorto} {partesDeFecha(d.fecha).largo} · {d.horaInicio} · {ESTADO[d.estado]}
                    </p>
                  </div>
                  {d.estado !== "en_curso" && <BotonSec onClick={() => void accion(d, "iniciar")}>Iniciar</BotonSec>}
                  {d.estado === "en_curso" && <BotonSec onClick={() => void accion(d, "finalizar")}>Finalizar</BotonSec>}
                  {d.estado !== "programado" && (
                    <BotonSec peligro onClick={() => void accion(d, "reiniciar")}>
                      Reiniciar
                    </BotonSec>
                  )}
                  <BotonSec onClick={() => setDesfile({ id: d.id, nombre: d.nombre, fecha: d.fecha, horaInicio: d.horaInicio })}>
                    Editar
                  </BotonSec>
                  <BotonSec
                    peligro
                    onClick={() => {
                      if (confirm(`¿Borrar «${d.nombre}» y todo su recorrido?`)) void enviar(`/api/admin/desfiles/${d.id}`, "DELETE");
                    }}
                  >
                    Borrar
                  </BotonSec>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* -------------------------------- Eventos ------------------------------ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="fuente-display text-[20px] text-tinta">Eventos</h2>
          <BotonSec onClick={() => setEvento(EVENTO_VACIO)}>Agregar evento</BotonSec>
        </div>
        <p className="text-[13px] text-tinta-3">
          Tarimas, tascas y todo lo que no es un desfile. Los de categoría «Tarima» que tengan punto
          salen en la capa Tarimas del mapa el día que les toca.
        </p>

        {evento && (
          <form onSubmit={guardarEvento} className={TARJETA}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <Campo etiqueta="Título">
                  <input value={evento.titulo} onChange={(e) => setEvento({ ...evento, titulo: e.target.value })} className={ENTRADA} required />
                </Campo>
                <div className="flex flex-wrap gap-3">
                  <Campo etiqueta="Fecha">
                    <input type="date" value={evento.fecha} onChange={(e) => setEvento({ ...evento, fecha: e.target.value })} className={ENTRADA} required />
                  </Campo>
                  <Campo etiqueta="Empieza">
                    <input type="time" value={evento.horaInicio} onChange={(e) => setEvento({ ...evento, horaInicio: e.target.value })} className={ENTRADA} required />
                  </Campo>
                  <Campo etiqueta="Termina">
                    <input type="time" value={evento.horaFin ?? ""} onChange={(e) => setEvento({ ...evento, horaFin: e.target.value || null })} className={ENTRADA} />
                  </Campo>
                </div>
                <Campo etiqueta="Categoría">
                  <select value={evento.categoria} onChange={(e) => setEvento({ ...evento, categoria: e.target.value as CategoriaEvento })} className={ENTRADA}>
                    {Object.entries(CATEGORIAS_EVENTO).map(([id, nombre]) => (
                      <option key={id} value={id}>
                        {nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Lugar">
                  <input value={evento.lugarNombre} onChange={(e) => setEvento({ ...evento, lugarNombre: e.target.value })} className={ENTRADA} />
                </Campo>
                <Campo etiqueta="Descripción">
                  <textarea value={evento.descripcion} onChange={(e) => setEvento({ ...evento, descripcion: e.target.value })} rows={2} className={ENTRADA} />
                </Campo>
                <label className="flex items-center gap-2 text-sm font-bold text-tinta">
                  <input type="checkbox" checked={evento.patrocinado} onChange={(e) => setEvento({ ...evento, patrocinado: e.target.checked })} />
                  Es pauta (sale con el sello «Pauta»)
                </label>
              </div>
              <div className="text-sm font-bold text-tinta">
                Punto en el mapa (opcional)
                <span className="block text-[12px] font-normal text-tinta-3">
                  Tocá donde es. Sin punto, el evento sale en las listas pero no en el mapa.
                </span>
                <div className="mt-1.5">
                  <MapaSelector lat={evento.lat} lng={evento.lng} onCambio={(lat, lng) => setEvento((x) => (x ? { ...x, lat, lng } : x))} />
                </div>
                {evento.lat !== null && (
                  <div className="mt-2">
                    <BotonSec onClick={() => setEvento({ ...evento, lat: null, lng: null })}>Quitar el punto</BotonSec>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <BotonPrimario>Guardar</BotonPrimario>
              <BotonSec onClick={() => setEvento(null)}>Cancelar</BotonSec>
            </div>
          </form>
        )}

        <div className={`${TARJETA} overflow-hidden p-0`}>
          {eventos === null ? (
            <p className="p-5 text-sm text-tinta-3">Cargando…</p>
          ) : eventos.length === 0 ? (
            <p className="p-5 text-sm text-tinta-3">No hay eventos.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {eventos.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                  <div className="min-w-48 flex-1">
                    <p className="font-bold text-tinta">
                      {e.titulo}
                      {e.patrocinado && (
                        <span className="ml-2 rounded bg-papel px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-tinta-2">
                          PAUTA
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-tinta-3">
                      {partesDeFecha(e.fecha).diaCorto} {partesDeFecha(e.fecha).largo} · {e.horaInicio}
                      {e.horaFin ? `–${e.horaFin}` : ""} · {CATEGORIAS_EVENTO[e.categoria]}
                      {e.lugarNombre ? ` · ${e.lugarNombre}` : ""}
                      {e.lat === null ? " · sin punto en el mapa" : ""}
                    </p>
                  </div>
                  <BotonSec onClick={() => setEvento(e)}>Editar</BotonSec>
                  <BotonSec
                    peligro
                    onClick={() => {
                      if (confirm(`¿Borrar «${e.titulo}»?`)) void enviar(`/api/admin/eventos/${e.id}`, "DELETE");
                    }}
                  >
                    Borrar
                  </BotonSec>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
