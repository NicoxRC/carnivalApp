"use client";

import { useEffect, useMemo, useState } from "react";

import { requestApi } from "@/lib/api/client";
import { parseProgress } from "@/lib/api/schedule";
import { minutesOfTime, dateParts } from "@/lib/dates";
import { shortTime, timeOfDay } from "@/lib/format";
import { useSchedule } from "@/lib/hooks/useSchedule";
import { useLanguage } from "@/lib/i18n";
import type { WaypointPass } from "@/lib/progress";
import type { Parade } from "@/lib/types";

interface Fila {
  id: string;
  hora: string;
  title: string;
  lugar: string;
  parade: Parade | null;
}

/**
 * La programación de todos los días: los desfiles (que se pueden seguir en el
 * mapa) y los demás eventos. De los desfiles que ya salieron se puede ver por
 * dónde pasó la cabeza y a qué hora.
 */
export function PantallaDesfiles() {
  const { t } = useLanguage();
  const programacion = useSchedule();
  const [diaElegido, setDiaElegido] = useState<string | null>(null);

  const dias = useMemo(() => {
    if (!programacion) return [];
    const fechas = new Set([
      ...programacion.parades.map((d) => d.date),
      ...programacion.events.map((e) => e.date),
    ]);
    return [...fechas].filter(Boolean).sort();
  }, [programacion]);

  // Hoy, si cae dentro del Carnaval; si no, el próximo día con algo; si no, el primero.
  // `hoy` viene del servidor en hora de Pasto: con `toISOString()` (UTC), desde
  // las 7 p. m. la app marcaba como "hoy" el día siguiente.
  const day =
    diaElegido ??
    (programacion
      ? dias.includes(programacion.today)
        ? programacion.today
        : (dias.find((d) => d > programacion.today) ?? dias[0] ?? null)
      : null);

  const filas = useMemo<Fila[]>(() => {
    if (!programacion || !day) return [];
    return [
      ...programacion.parades
        .filter((d) => d.date === day)
        .map((d) => ({ id: d.id, hora: d.startTime, title: d.name, lugar: "Senda del Carnaval", parade: d })),
      ...programacion.events
        .filter((e) => e.date === day)
        .map((e) => ({ id: e.id, hora: e.startTime, title: e.title, lugar: e.placeName, parade: null })),
    ].sort((a, b) => minutesOfTime(a.hora) - minutesOfTime(b.hora));
  }, [programacion, day]);

  return (
    <div className="flex-1 bg-papel-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-seguro px-5 pb-3.5 lg:px-6 lg:pt-8">
          <h1 className="fuente-display text-[34px] leading-none text-tinta">{t("parades.title")}</h1>
          <p className="mt-1.5 text-sm text-tinta-3">{t("parades.sub")}</p>
        </header>

        {/* Selector de día */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 lg:px-6" role="tablist" aria-label={t("parades.sub")}>
          {dias.map((d) => {
            const active = d === day;
            const p = dateParts(d);
            return (
              <button
                key={d}
                role="tab"
                aria-selected={active}
                aria-label={p.long}
                onClick={() => setDiaElegido(d)}
                className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2.5 ${
                  active ? "border-tinta bg-tinta text-papel" : "border-borde-2 bg-blanco text-tinta"
                }`}
              >
                <span className={`text-[10px] font-bold tracking-[1px] ${active ? "text-papel/70" : "text-tinta-4"}`}>
                  {p.shortDay}
                </span>
                <span className="fuente-display text-xl leading-tight">{p.dayNumber}</span>
              </button>
            );
          })}
        </div>

        <p className="mx-4 mt-3.5 rounded-xl bg-papel px-3 py-2 text-[11px] leading-snug font-semibold text-aviso-txt lg:mx-6">
          {t("parades.sample")}
        </p>

        <div className="flex flex-col gap-3 px-4 py-3.5 pb-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-6">
          {programacion && filas.length === 0 && (
            <p className="text-[14px] text-tinta-3">{t("parades.empty")}</p>
          )}
          {filas.map((f) => (
            <article key={f.id} className="rounded-2xl border border-borde bg-blanco px-4 py-3.5">
              <div className="flex items-center gap-3.5">
                <div className="w-[84px] shrink-0 text-center">
                  <div className="text-[15px] font-extrabold whitespace-nowrap text-tinta">{timeOfDay(f.hora)}</div>
                  {day === programacion?.today && (
                    <div className="text-[11px] font-bold tracking-[1px] text-cabeza-txt uppercase">
                      {t("parades.today")}
                    </div>
                  )}
                </div>

                <div className="h-[38px] w-px shrink-0 bg-borde" aria-hidden />

                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-extrabold text-tinta">{f.title}</h2>
                  <p className="mt-0.5 truncate text-[13px] text-tinta-3">
                    {f.parade && f.parade.state !== "scheduled" ? (
                      <span className={`font-bold ${f.parade.state === "in_progress" ? "text-ok" : "text-tinta-3"}`}>
                        {t(f.parade.state === "in_progress" ? "parades.inProgress" : "parades.finished")} ·{" "}
                      </span>
                    ) : null}
                    {f.lugar}
                  </p>
                </div>

                {f.parade && (
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-lg bg-cabeza/12"
                    title={t("parades.followable")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--color-cabeza)" aria-hidden>
                      <path d="M6 3l12 9-12 9z" />
                    </svg>
                  </span>
                )}
              </div>

              {f.parade && f.parade.state !== "scheduled" && <Recorrido paradeId={f.parade.id} />}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Por dónde pasó la cabeza y a qué hora. Se pide solo si alguien lo abre. */
function Recorrido({ paradeId }: { paradeId: string }) {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const [passes, setPasos] = useState<WaypointPass[] | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let alive = true;
    requestApi(`/api/parades/${encodeURIComponent(paradeId)}/progress`)
      .then((r) => r.json())
      .then((json) => {
        if (alive) setPasos(parseProgress(json));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [abierto, paradeId]);

  return (
    <div className="mt-3 border-t border-borde pt-2.5">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="text-[13px] font-bold text-tinta underline underline-offset-2"
      >
        {abierto ? t("parades.hide") : t("parades.progress")}
      </button>
      {abierto && passes && (
        <ol className="mt-2 space-y-1">
          {passes.map((p) => (
            <li key={p.waypointId} className="flex justify-between gap-3 text-[13px]">
              <span className={p.ts ? "text-tinta" : "text-tinta-4"}>{p.name}</span>
              <span className={`shrink-0 font-bold ${p.ts ? "text-tinta-2" : "text-tinta-4"}`}>
                {p.ts ? shortTime(p.ts) : t("parades.notYet")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
