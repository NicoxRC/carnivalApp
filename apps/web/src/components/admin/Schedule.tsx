"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import {
  api,
  CARD_CLASS,
  failureText,
  Field,
  INPUT_CLASS,
  PrimaryButton,
  SecondaryButton,
  slugId,
  type Can,
} from "@/components/admin/common";
import { dateParts } from "@/lib/dates";
import { EVENT_CATEGORIES } from "@/lib/schedule";
import type { EventCategory, Parade, ScheduleEvent } from "@/lib/types";

const MapPicker = dynamic(() => import("@/components/admin/MapPicker"), {
  ssr: false,
  loading: () => <div className="h-72 w-full rounded-2xl bg-paper-2" />,
});

const STATE_LABEL = { scheduled: "Programado", in_progress: "En curso", finished: "Finalizado" } as const;

type ParadeDraft = { id: string | null; name: string; date: string; startTime: string };
type EventDraft = Omit<ScheduleEvent, "id"> & { id: string | null };

const EMPTY_EVENT: EventDraft = {
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

export function Schedule({ onExpired, can }: { onExpired: () => void; can: Can }) {
  const editParades = can("parades:edit");
  const editEvents = can("schedule:edit");
  const [parades, setParades] = useState<Parade[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [events, setEvents] = useState<ScheduleEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parade, setParade] = useState<ParadeDraft | null>(null);
  const [event, setEvent] = useState<EventDraft | null>(null);

  const reload = useCallback(async () => {
    const none = { ok: true as const, data: null };
    const [d, e] = await Promise.all([
      api<{ parades: Parade[]; currentId: string | null }>("/api/admin/parades"),
      editEvents ? api<{ events: ScheduleEvent[] }>("/api/admin/events") : Promise.resolve(none),
    ]);
    if (!d.ok || !e.ok) {
      const failure = !d.ok ? d : (e as Exclude<typeof e, { ok: true }>);
      if (failure.status === 401) onExpired();
      else setError(failureText(failure));
      return;
    }
    setParades([...d.data.parades].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)));
    setCurrentId(d.data.currentId);
    if (e.data) setEvents([...e.data.events].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)));
  }, [onExpired, editEvents]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const send = async (url: string, method: string, body?: unknown) => {
    const r = await api(url, { method, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      if (r.status === 401) onExpired();
      setError(failureText(r));
      return false;
    }
    setError(null);
    void reload();
    return true;
  };

  const saveParade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parade) return;
    const id = parade.id ?? slugId(parade.name, (parades ?? []).map((d) => d.id));
    const { id: _, ...body } = parade;
    const ok = await send(`/api/admin/parades/${encodeURIComponent(id)}`, "PUT", body);
    if (ok) setParade(null);
  };

  const saveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    const id = event.id ?? slugId(event.title, (events ?? []).map((x) => x.id));
    const { id: _, ...body } = event;
    const ok = await send(`/api/admin/events/${encodeURIComponent(id)}`, "PUT", body);
    if (ok) setEvent(null);
  };

  const action = async (d: Parade, a: "start" | "finish" | "restart") => {
    if (a === "restart" && !confirm(`¿Reiniciar «${d.name}»? Se borran todas sus posiciones.`)) return;
    await send(`/api/admin/parades/${encodeURIComponent(d.id)}`, "PATCH", { action: a });
  };

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm font-semibold text-alert">{error}</p> : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="display-font text-[20px] text-ink">Desfiles</h2>
          {editParades && (
            <SecondaryButton onClick={() => setParade({ id: null, name: "", date: "", startTime: "09:00" })}>
              Agregar desfile
            </SecondaryButton>
          )}
        </div>
        <p className="text-[13px] text-ink-3">
          La app sigue un desfile a la vez: el que está en curso; si no hay, el de hoy; si no, el
          próximo. Ese es el que ve el público y en el que escriben los reporteros.
        </p>

        {parade && (
          <form onSubmit={saveParade} className={`${CARD_CLASS} flex flex-wrap items-end gap-3`}>
            <div className="min-w-56 flex-1">
              <Field label="Nombre">
                <input value={parade.name} onChange={(e) => setParade({ ...parade, name: e.target.value })} className={INPUT_CLASS} required />
              </Field>
            </div>
            <Field label="Fecha">
              <input type="date" value={parade.date} onChange={(e) => setParade({ ...parade, date: e.target.value })} className={INPUT_CLASS} required />
            </Field>
            <Field label="Hora de salida">
              <input type="time" value={parade.startTime} onChange={(e) => setParade({ ...parade, startTime: e.target.value })} className={INPUT_CLASS} required />
            </Field>
            <PrimaryButton>Guardar</PrimaryButton>
            <SecondaryButton onClick={() => setParade(null)}>Cancelar</SecondaryButton>
          </form>
        )}

        <div className={`${CARD_CLASS} overflow-hidden p-0`}>
          {parades === null ? (
            <p className="p-5 text-sm text-ink-3">Cargando…</p>
          ) : parades.length === 0 ? (
            <p className="p-5 text-sm text-ink-3">No hay desfiles. Sin al menos uno, el mapa no tiene qué seguir.</p>
          ) : (
            <ul className="divide-y divide-line">
              {parades.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 px-5 py-3.5">
                  <div className="min-w-48 flex-1">
                    <p className="font-bold text-ink">
                      {d.name}
                      {d.id === currentId && (
                        <span className="ml-2 rounded bg-head px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-white">
                          EL QUE VE EL PÚBLICO
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-ink-3">
                      {dateParts(d.date).shortDay} {dateParts(d.date).long} · {d.startTime} · {STATE_LABEL[d.state]}
                    </p>
                  </div>
                  {can("parades:state") && d.state !== "in_progress" && <SecondaryButton onClick={() => void action(d, "start")}>Iniciar</SecondaryButton>}
                  {can("parades:state") && d.state === "in_progress" && <SecondaryButton onClick={() => void action(d, "finish")}>Finalizar</SecondaryButton>}
                  {can("parades:state") && d.state !== "scheduled" && (
                    <SecondaryButton danger onClick={() => void action(d, "restart")}>
                      Reiniciar
                    </SecondaryButton>
                  )}
                  {editParades && (
                    <>
                      <SecondaryButton onClick={() => setParade({ id: d.id, name: d.name, date: d.date, startTime: d.startTime })}>
                        Editar
                      </SecondaryButton>
                      <SecondaryButton
                        danger
                        onClick={() => {
                          if (confirm(`¿Borrar «${d.name}» y todo su recorrido?`))
                            void send(`/api/admin/parades/${encodeURIComponent(d.id)}`, "DELETE");
                        }}
                      >
                        Borrar
                      </SecondaryButton>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

{editEvents && (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="display-font text-[20px] text-ink">Eventos</h2>
          <SecondaryButton onClick={() => setEvent(EMPTY_EVENT)}>Agregar evento</SecondaryButton>
        </div>
        <p className="text-[13px] text-ink-3">
          Tarimas, tascas y todo lo que no es un desfile. Los de categoría «Tarima» que tengan punto
          salen en la capa Tarimas del mapa el día que les toca.
        </p>

        {event && (
          <form onSubmit={saveEvent} className={CARD_CLASS}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <Field label="Título">
                  <input value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} className={INPUT_CLASS} required />
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Field label="Fecha">
                    <input type="date" value={event.date} onChange={(e) => setEvent({ ...event, date: e.target.value })} className={INPUT_CLASS} required />
                  </Field>
                  <Field label="Empieza">
                    <input type="time" value={event.startTime} onChange={(e) => setEvent({ ...event, startTime: e.target.value })} className={INPUT_CLASS} required />
                  </Field>
                  <Field label="Termina">
                    <input type="time" value={event.endTime ?? ""} onChange={(e) => setEvent({ ...event, endTime: e.target.value || null })} className={INPUT_CLASS} />
                  </Field>
                </div>
                <Field label="Categoría">
                  <select value={event.category} onChange={(e) => setEvent({ ...event, category: e.target.value as EventCategory })} className={INPUT_CLASS}>
                    {Object.entries(EVENT_CATEGORIES).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Lugar">
                  <input value={event.placeName} onChange={(e) => setEvent({ ...event, placeName: e.target.value })} className={INPUT_CLASS} />
                </Field>
                <Field label="Descripción">
                  <textarea value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} rows={2} className={INPUT_CLASS} />
                </Field>
                <label className="flex items-center gap-2 text-sm font-bold text-ink">
                  <input type="checkbox" checked={event.sponsored} onChange={(e) => setEvent({ ...event, sponsored: e.target.checked })} />
                  Es pauta (sale con el sello «Pauta»)
                </label>
              </div>
              <div className="text-sm font-bold text-ink">
                Punto en el mapa (opcional)
                <span className="block text-[12px] font-normal text-ink-3">
                  Tocá donde es. Sin punto, el evento sale en las listas pero no en el mapa.
                </span>
                <div className="mt-1.5">
                  <MapPicker lat={event.lat} lng={event.lng} onChange={(lat, lng) => setEvent((x) => (x ? { ...x, lat, lng } : x))} />
                </div>
                {event.lat !== null && (
                  <div className="mt-2">
                    <SecondaryButton onClick={() => setEvent({ ...event, lat: null, lng: null })}>Quitar el punto</SecondaryButton>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <PrimaryButton>Guardar</PrimaryButton>
              <SecondaryButton onClick={() => setEvent(null)}>Cancelar</SecondaryButton>
            </div>
          </form>
        )}

        <div className={`${CARD_CLASS} overflow-hidden p-0`}>
          {events === null ? (
            <p className="p-5 text-sm text-ink-3">Cargando…</p>
          ) : events.length === 0 ? (
            <p className="p-5 text-sm text-ink-3">No hay eventos.</p>
          ) : (
            <ul className="divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                  <div className="min-w-48 flex-1">
                    <p className="font-bold text-ink">
                      {e.title}
                      {e.sponsored && (
                        <span className="ml-2 rounded bg-paper px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-ink-2">
                          PAUTA
                        </span>
                      )}
                    </p>
                    <p className="text-[13px] text-ink-3">
                      {dateParts(e.date).shortDay} {dateParts(e.date).long} · {e.startTime}
                      {e.endTime ? `–${e.endTime}` : ""} · {EVENT_CATEGORIES[e.category]}
                      {e.placeName ? ` · ${e.placeName}` : ""}
                      {e.lat === null ? " · sin punto en el mapa" : ""}
                    </p>
                  </div>
                  <SecondaryButton onClick={() => setEvent(e)}>Editar</SecondaryButton>
                  <SecondaryButton
                    danger
                    onClick={() => {
                      if (confirm(`¿Borrar «${e.title}»?`)) void send(`/api/admin/events/${encodeURIComponent(e.id)}`, "DELETE");
                    }}
                  >
                    Borrar
                  </SecondaryButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
