"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { api, BotonPrimario, BotonSec, Campo, ENTRADA, TARJETA } from "@/components/admin/comun";
import { dateParts } from "@/lib/dates";
import { EVENT_CATEGORIES } from "@/lib/schedule";
import type { EventCategory, Parade, ScheduleEvent } from "@/lib/types";

const MapaSelector = dynamic(() => import("@/components/admin/MapaSelector"), {
  ssr: false,
  loading: () => <div className="h-72 w-full rounded-2xl bg-papel-2" />,
});

const ESTADO = { scheduled: "Programado", in_progress: "En curso", finished: "Finalizado" } as const;

type BorradorDesfile = { id: string | null; name: string; date: string; startTime: string };
type BorradorEvento = Omit<ScheduleEvent, "id"> & { id: string | null };

const EVENTO_VACIO: BorradorEvento = {
  id: null,
  date: "",
  startTime: "",
  endTime: null,
  title: "",
  description: "",
  category: "stage",
  placeName: "",
  lat: null,
  lng: null,
  sponsored: false,
};

/**
 * La programación: los desfiles de cada día (los que la app sigue en vivo) y
 * los demás eventos. Lo que se edite aquí es lo que ven «Hoy» y «Desfiles».
 */
export function Schedule({ onVencida }: { onVencida: () => void }) {
  const [parades, setDesfiles] = useState<Parade[] | null>(null);
  const [currentId, setActualId] = useState<string | null>(null);
  const [events, setEventos] = useState<ScheduleEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parade, setDesfile] = useState<BorradorDesfile | null>(null);
  const [event, setEvento] = useState<BorradorEvento | null>(null);

  const recargar = useCallback(async () => {
    const [d, e] = await Promise.all([
      api<{ parades: Parade[]; currentId: string | null }>("/api/admin/desfiles"),
      api<{ events: ScheduleEvent[] }>("/api/admin/eventos"),
    ]);
    if (!d.ok || !e.ok) {
      const fallo = !d.ok ? d : (e as Exclude<typeof e, { ok: true }>);
      if (fallo.status === 401) onVencida();
      else setError(fallo.error);
      return;
    }
    setDesfiles([...d.datos.parades].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)));
    setActualId(d.datos.currentId);
    setEventos([...e.datos.events].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)));
  }, [onVencida]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const send = async (url: string, method: string, body?: unknown) => {
    const r = await api(url, { method, body: body ? JSON.stringify(body) : undefined });
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
    if (!parade) return;
    const ok = await send(parade.id ? `/api/admin/desfiles/${parade.id}` : "/api/admin/desfiles", parade.id ? "PUT" : "POST", parade);
    if (ok) setDesfile(null);
  };

  const guardarEvento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    const ok = await send(event.id ? `/api/admin/eventos/${event.id}` : "/api/admin/eventos", event.id ? "PUT" : "POST", event);
    if (ok) setEvento(null);
  };

  const accion = async (d: Parade, a: "iniciar" | "finalizar" | "reiniciar") => {
    if (a === "reiniciar" && !confirm(`¿Reiniciar «${d.name}»? Se borran todas sus posiciones.`)) return;
    await send(`/api/admin/desfiles/${d.id}`, "PATCH", { accion: a });
  };

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm font-semibold text-alerta">{error}</p> : null}

      {/* ------------------------------- Desfiles ------------------------------ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="fuente-display text-[20px] text-tinta">Desfiles</h2>
          <BotonSec onClick={() => setDesfile({ id: null, name: "", date: "", startTime: "09:00" })}>
            Agregar desfile
          </BotonSec>
        </div>
        <p className="text-[13px] text-tinta-3">
          La app sigue un desfile a la vez: el que está en curso; si no hay, el de hoy; si no, el
          próximo. Ese es el que ve el público y en el que escriben los reporteros.
        </p>

        {parade && (
          <form onSubmit={guardarDesfile} className={`${TARJETA} flex flex-wrap items-end gap-3`}>
            <div className="min-w-56 flex-1">
              <Campo etiqueta="Nombre">
                <input value={parade.name} onChange={(e) => setDesfile({ ...parade, name: e.target.value })} className={ENTRADA} required />
              </Campo>
            </div>
            <Campo etiqueta="Fecha">
              <input type="date" value={parade.date} onChange={(e) => setDesfile({ ...parade, date: e.target.value })} className={ENTRADA} required />
            </Campo>
            <Campo etiqueta="Hora de salida">
              <input type="time" value={parade.startTime} onChange={(e) => setDesfile({ ...parade, startTime: e.target.value })} className={ENTRADA} required />
            </Campo>
            <BotonPrimario>Guardar</BotonPrimario>
            <BotonSec onClick={() => setDesfile(null)}>Cancelar</BotonSec>
          </form>
        )}

        <div className={`${TARJETA} overflow-hidden p-0`}>
          {parades === null ? (
            <p className="p-5 text-sm text-tinta-3">Cargando…</p>
          ) : parades.length === 0 ? (
            <p className="p-5 text-sm text-tinta-3">No hay desfiles. Sin al menos uno, el mapa no tiene qué seguir.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {parades.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-5 py-3.5">
                  <div className="min-w-48 flex-1">
                    <p className="font-bold text-tinta">
                      {d.name}
                      {d.id === currentId && (
                        <span className="ml-2 rounded bg-cabeza px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-white">
                          EL QUE VE EL PÚBLICO
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-tinta-3">
                      {dateParts(d.date).shortDay} {dateParts(d.date).long} · {d.startTime} · {ESTADO[d.state]}
                    </p>
                  </div>
                  {d.state !== "in_progress" && <BotonSec onClick={() => void accion(d, "iniciar")}>Iniciar</BotonSec>}
                  {d.state === "in_progress" && <BotonSec onClick={() => void accion(d, "finalizar")}>Finalizar</BotonSec>}
                  {d.state !== "scheduled" && (
                    <BotonSec peligro onClick={() => void accion(d, "reiniciar")}>
                      Reiniciar
                    </BotonSec>
                  )}
                  <BotonSec onClick={() => setDesfile({ id: d.id, name: d.name, date: d.date, startTime: d.startTime })}>
                    Editar
                  </BotonSec>
                  <BotonSec
                    peligro
                    onClick={() => {
                      if (confirm(`¿Borrar «${d.name}» y todo su recorrido?`)) void send(`/api/admin/desfiles/${d.id}`, "DELETE");
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

        {event && (
          <form onSubmit={guardarEvento} className={TARJETA}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <Campo etiqueta="Título">
                  <input value={event.title} onChange={(e) => setEvento({ ...event, title: e.target.value })} className={ENTRADA} required />
                </Campo>
                <div className="flex flex-wrap gap-3">
                  <Campo etiqueta="Fecha">
                    <input type="date" value={event.date} onChange={(e) => setEvento({ ...event, date: e.target.value })} className={ENTRADA} required />
                  </Campo>
                  <Campo etiqueta="Empieza">
                    <input type="time" value={event.startTime} onChange={(e) => setEvento({ ...event, startTime: e.target.value })} className={ENTRADA} required />
                  </Campo>
                  <Campo etiqueta="Termina">
                    <input type="time" value={event.endTime ?? ""} onChange={(e) => setEvento({ ...event, endTime: e.target.value || null })} className={ENTRADA} />
                  </Campo>
                </div>
                <Campo etiqueta="Categoría">
                  <select value={event.category} onChange={(e) => setEvento({ ...event, category: e.target.value as EventCategory })} className={ENTRADA}>
                    {Object.entries(EVENT_CATEGORIES).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Lugar">
                  <input value={event.placeName} onChange={(e) => setEvento({ ...event, placeName: e.target.value })} className={ENTRADA} />
                </Campo>
                <Campo etiqueta="Descripción">
                  <textarea value={event.description} onChange={(e) => setEvento({ ...event, description: e.target.value })} rows={2} className={ENTRADA} />
                </Campo>
                <label className="flex items-center gap-2 text-sm font-bold text-tinta">
                  <input type="checkbox" checked={event.sponsored} onChange={(e) => setEvento({ ...event, sponsored: e.target.checked })} />
                  Es pauta (sale con el sello «Pauta»)
                </label>
              </div>
              <div className="text-sm font-bold text-tinta">
                Punto en el mapa (opcional)
                <span className="block text-[12px] font-normal text-tinta-3">
                  Tocá donde es. Sin punto, el evento sale en las listas pero no en el mapa.
                </span>
                <div className="mt-1.5">
                  <MapaSelector lat={event.lat} lng={event.lng} onCambio={(lat, lng) => setEvento((x) => (x ? { ...x, lat, lng } : x))} />
                </div>
                {event.lat !== null && (
                  <div className="mt-2">
                    <BotonSec onClick={() => setEvento({ ...event, lat: null, lng: null })}>Quitar el punto</BotonSec>
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
          {events === null ? (
            <p className="p-5 text-sm text-tinta-3">Cargando…</p>
          ) : events.length === 0 ? (
            <p className="p-5 text-sm text-tinta-3">No hay eventos.</p>
          ) : (
            <ul className="divide-y divide-borde">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                  <div className="min-w-48 flex-1">
                    <p className="font-bold text-tinta">
                      {e.title}
                      {e.sponsored && (
                        <span className="ml-2 rounded bg-papel px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-tinta-2">
                          PAUTA
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-tinta-3">
                      {dateParts(e.date).shortDay} {dateParts(e.date).long} · {e.startTime}
                      {e.endTime ? `–${e.endTime}` : ""} · {EVENT_CATEGORIES[e.category]}
                      {e.placeName ? ` · ${e.placeName}` : ""}
                      {e.lat === null ? " · sin punto en el mapa" : ""}
                    </p>
                  </div>
                  <BotonSec onClick={() => setEvento(e)}>Editar</BotonSec>
                  <BotonSec
                    peligro
                    onClick={() => {
                      if (confirm(`¿Borrar «${e.title}»?`)) void send(`/api/admin/eventos/${e.id}`, "DELETE");
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
