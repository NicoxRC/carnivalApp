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

interface Row {
  id: string;
  time: string;
  title: string;
  place: string;
  parade: Parade | null;
}

export function ParadesScreen() {
  const { t } = useLanguage();
  const schedule = useSchedule();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const days = useMemo(() => {
    if (!schedule) return [];
    const dates = new Set([
      ...schedule.parades.map((d) => d.date),
      ...schedule.events.map((e) => e.date),
    ]);
    return [...dates].filter(Boolean).sort();
  }, [schedule]);

  const day =
    selectedDay ??
    (schedule
      ? days.includes(schedule.today)
        ? schedule.today
        : (days.find((d) => d > schedule.today) ?? days[0] ?? null)
      : null);

  const rows = useMemo<Row[]>(() => {
    if (!schedule || !day) return [];
    return [
      ...schedule.parades
        .filter((d) => d.date === day)
        .map((d) => ({ id: d.id, time: d.startTime, title: d.name, place: "Senda del Carnaval", parade: d })),
      ...schedule.events
        .filter((e) => e.date === day)
        .map((e) => ({ id: e.id, time: e.startTime, title: e.title, place: e.placeName, parade: null })),
    ].sort((a, b) => minutesOfTime(a.time) - minutesOfTime(b.time));
  }, [schedule, day]);

  return (
    <div className="flex-1 bg-paper-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-safe px-5 pb-3.5 lg:px-6 lg:pt-8">
          <h1 className="display-font text-[34px] leading-none text-ink">{t("parades.title")}</h1>
          <p className="mt-1.5 text-sm text-ink-3">{t("parades.sub")}</p>
        </header>

        <div className="flex gap-2 overflow-x-auto px-4 pb-1 lg:px-6" role="tablist" aria-label={t("parades.sub")}>
          {days.map((d) => {
            const active = d === day;
            const p = dateParts(d);
            return (
              <button
                key={d}
                role="tab"
                aria-selected={active}
                aria-label={p.long}
                onClick={() => setSelectedDay(d)}
                className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2.5 ${
                  active ? "border-ink bg-ink text-paper" : "border-line-2 bg-white text-ink"
                }`}
              >
                <span className={`text-[10px] font-bold tracking-[1px] ${active ? "text-paper/70" : "text-ink-4"}`}>
                  {p.shortDay}
                </span>
                <span className="display-font text-xl leading-tight">{p.dayNumber}</span>
              </button>
            );
          })}
        </div>

        <p className="mx-4 mt-3.5 rounded-xl bg-paper px-3 py-2 text-[11px] leading-snug font-semibold text-warn-text lg:mx-6">
          {t("parades.sample")}
        </p>

        <div className="flex flex-col gap-3 px-4 py-3.5 pb-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-6">
          {schedule && rows.length === 0 && (
            <p className="text-[14px] text-ink-3">{t("parades.empty")}</p>
          )}
          {rows.map((f) => (
            <article key={f.id} className="rounded-2xl border border-line bg-white px-4 py-3.5">
              <div className="flex items-center gap-3.5">
                <div className="w-[84px] shrink-0 text-center">
                  <div className="text-[15px] font-extrabold whitespace-nowrap text-ink">{timeOfDay(f.time)}</div>
                  {day === schedule?.today && (
                    <div className="text-[11px] font-bold tracking-[1px] text-head-text uppercase">
                      {t("parades.today")}
                    </div>
                  )}
                </div>

                <div className="h-[38px] w-px shrink-0 bg-line" aria-hidden />

                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-extrabold text-ink">{f.title}</h2>
                  <p className="mt-0.5 truncate text-[13px] text-ink-3">
                    {f.parade && f.parade.state !== "scheduled" ? (
                      <span className={`font-bold ${f.parade.state === "in_progress" ? "text-ok" : "text-ink-3"}`}>
                        {t(f.parade.state === "in_progress" ? "parades.inProgress" : "parades.finished")} ·{" "}
                      </span>
                    ) : null}
                    {f.place}
                  </p>
                </div>

                {f.parade && (
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-lg bg-head/12"
                    title={t("parades.followable")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--color-head)" aria-hidden>
                      <path d="M6 3l12 9-12 9z" />
                    </svg>
                  </span>
                )}
              </div>

              {f.parade && f.parade.state !== "scheduled" && <Progress paradeId={f.parade.id} />}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function Progress({ paradeId }: { paradeId: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [passes, setPasses] = useState<WaypointPass[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    requestApi(`/api/parades/${encodeURIComponent(paradeId)}/progress`)
      .then((r) => r.json())
      .then((json) => {
        if (alive) setPasses(parseProgress(json));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, paradeId]);

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-[13px] font-bold text-ink underline underline-offset-2"
      >
        {open ? t("parades.hide") : t("parades.progress")}
      </button>
      {open && passes && (
        <ol className="mt-2 space-y-1">
          {passes.map((p) => (
            <li key={p.waypointId} className="flex justify-between gap-3 text-[13px]">
              <span className={p.ts ? "text-ink" : "text-ink-4"}>{p.name}</span>
              <span className={`shrink-0 font-bold ${p.ts ? "text-ink-2" : "text-ink-4"}`}>
                {p.ts ? shortTime(p.ts) : t("parades.notYet")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
