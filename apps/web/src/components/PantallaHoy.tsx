"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";

import { Avisos } from "@/components/Avisos";
import { computeEta } from "@/lib/eta";
import { minutesOfTime, minuteOfDayInPasto, dateParts } from "@/lib/dates";
import { shortDistance, timeOfDay } from "@/lib/format";
import { haversineDistance } from "@/lib/geo";
import { useBusinesses } from "@/lib/hooks/useBusinesses";
import { useParadeState, useClock } from "@/lib/hooks/useParadeState";
import { useSchedule } from "@/lib/hooks/useSchedule";
import { useUserLocation } from "@/lib/hooks/useUserLocation";
import { useLanguage } from "@/lib/i18n";
import { countMetric } from "@/lib/metrics";
import { MAX_USER_OFFSET_M } from "@/lib/course";

/** El sol del encabezado, tal cual el diseño. */
function IconoSol() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" fill="var(--color-cabeza)" />
      <g stroke="var(--color-mitad)" strokeWidth="1.8" strokeLinecap="round">
        <line x1="12" y1="2.5" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="21.5" />
        <line x1="2.5" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="21.5" y2="12" />
        <line x1="5" y1="5" x2="6.8" y2="6.8" />
        <line x1="17.2" y1="17.2" x2="19" y2="19" />
        <line x1="19" y1="5" x2="17.2" y2="6.8" />
        <line x1="6.8" y1="17.2" x2="5" y2="19" />
      </g>
    </svg>
  );
}

export function PantallaHoy() {
  const { t } = useLanguage();
  const { state, clockOffsetMs } = useParadeState();
  const { location, request, permission } = useUserLocation();
  const programacion = useSchedule();
  const businesses = useBusinesses(true);
  const relojLocal = useClock(30_000);
  const now = relojLocal + clockOffsetMs;

  // Hora de Pasto, no la del celular: un turista con otra zona horaria vería
  // "ya pasó" en eventos que todavía no empiezan.
  const minutosAhora = minuteOfDayInPasto(now);

  // El desfile es la tarjeta destacada: es lo único de esta pantalla que va en vivo.
  const eta = useMemo(() => {
    if (!state) return null;
    return computeEta({
      state,
      userMetres: location?.projection.metres ?? null,
      userOffsetM: location?.projection.offsetM ?? null,
      maxOffsetM: MAX_USER_OFFSET_M,
      now,
    });
  }, [state, location, now]);

  /**
   * Los eventos de HOY. Si hoy no hay nada (falta para el Carnaval, o es un día
   * sin programación) se muestra el próximo día que tenga, diciendo cuál es:
   * mejor "lo próximo: 2 de enero" que una pantalla vacía.
   */
  const { day, esHoy, events } = useMemo(() => {
    if (!programacion) return { day: null, esHoy: true, events: [] };
    const fechas = [...new Set(programacion.events.map((e) => e.date))].sort();
    const elegido = fechas.includes(programacion.today)
      ? programacion.today
      : (fechas.find((f) => f > programacion.today) ?? null);
    const today = elegido === programacion.today;
    const list = programacion.events
      .filter((e) => e.date === elegido)
      .sort((a, b) => minutesOfTime(a.startTime) - minutesOfTime(b.startTime))
      .map((e) => {
        const start = minutesOfTime(e.startTime);
        const fin = e.endTime ? minutesOfTime(e.endTime) : start + 60;
        return {
          ...e,
          distanceM:
            location && e.lat !== null && e.lng !== null
              ? haversineDistance(location.lat, location.lng, e.lat, e.lng)
              : null,
          inFlight: today && minutosAhora >= start && minutosAhora < fin,
          yaPaso: today && minutosAhora >= fin,
        };
      });
    return { day: elegido, esHoy: today, events: list };
  }, [programacion, location, minutosAhora]);

  // Un comercio destacado, marcado como pauta. Rota con la hora para repartir
  // la vitrina entre todos los que pagaron el plan.
  const featured = useMemo(() => {
    const list = businesses.filter((c) => c.plan === "featured");
    return list.length > 0 ? list[Math.floor(minutosAhora / 30) % list.length] : null;
  }, [businesses, minutosAhora]);
  const idDestacado = featured?.id ?? null;
  useEffect(() => {
    if (idDestacado) countMetric(idDestacado, "offer");
  }, [idDestacado]);

  const enVivo = state?.state === "in_progress" && Boolean(state.positions.head);

  return (
    <div className="flex-1 bg-papel-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-seguro flex items-center justify-between px-5 pb-3.5 lg:px-6 lg:pt-8">
          <div>
            <h1 className="fuente-display text-[34px] leading-none text-tinta">{t("today.title")}</h1>
            <p className="mt-1.5 text-sm text-tinta-3">
              {state?.name}
              {programacion ? ` · ${dateParts(programacion.today).long}` : ""}
            </p>
          </div>
          <IconoSol />
        </header>

        <div className="flex flex-col gap-3.5 px-4 pb-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-6">
          {state && state.announcements.length > 0 && (
            <div className="lg:col-span-2">
              <Avisos announcements={state.announcements} />
            </div>
          )}

          {/* --- El desfile, en vivo --- */}
          {enVivo && eta ? (
            <article className="overflow-hidden rounded-[20px] border-2 border-cabeza bg-blanco shadow-[0_10px_26px_-12px_rgba(234,90,18,0.45)] lg:col-span-2">
              <div className="flex items-center gap-2 bg-cabeza px-4 py-2">
                <span className="latido size-2 rounded-full bg-white" aria-hidden />
                <span className="text-[13px] font-extrabold tracking-[1.5px] text-white">
                  {t("today.rightNow")}
                </span>
              </div>
              <div className="p-4">
                <h2 className="fuente-display text-2xl leading-[1.05] text-tinta">
                  {state?.name}
                </h2>
                {eta.kind === "arriving" || eta.kind === "stopped" ? (
                  <>
                    <p className="mt-3.5 flex items-baseline gap-2">
                      <span className="text-[30px] font-extrabold tracking-[-0.5px] text-cabeza-txt">
                        {t("today.away", { d: shortDistance(eta.distanceM) })}
                      </span>
                      <span className="text-[15px] text-tinta-2">
                        {eta.distanceM < 900 ? t("today.almost") : t("today.fromYou")}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-tinta-3">
                      {eta.kind === "stopped"
                        ? t("today.stopped", { n: eta.stoppedForMin })
                        : t("today.reachesIn", { a: eta.minMin, b: eta.maxMin })}
                    </p>
                  </>
                ) : (
                  <p className="mt-3.5 text-[15px] text-tinta-2">
                    {eta.kind === "here"
                      ? t("today.passing")
                      : eta.kind === "passed"
                        ? t("today.passed")
                        : eta.kind === "no_signal"
                          ? t("today.noSignal", { n: eta.agoMin })
                          : t("today.tellUs")}
                  </p>
                )}

                <Link
                  href="/"
                  className="mt-3.5 flex h-[46px] items-center justify-center gap-2 rounded-xl bg-tinta text-[15px] font-extrabold text-papel active:opacity-90"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-cabeza)" aria-hidden>
                    <path d="M6 3l12 9-12 9z" />
                  </svg>
                  {t("today.followOnMap")}
                </Link>
              </div>
            </article>
          ) : (
            <article className="rounded-[20px] border border-borde-2 bg-blanco p-4 lg:col-span-2">
              <h2 className="fuente-display text-2xl leading-[1.05] text-tinta">
                {state?.name ?? "Desfile"}
              </h2>
              <p className="mt-1.5 text-sm text-tinta-3">
                {state?.state === "finished"
                  ? t("parades.finished")
                  : state && programacion && state.date !== programacion.today
                    ? t("today.starts", { date: dateParts(state.date).long, time: timeOfDay(state.startTime) })
                    : t("today.notStarted")}
              </p>
              <Link
                href="/"
                className="mt-3.5 flex h-[46px] items-center justify-center gap-2 rounded-xl bg-tinta text-[15px] font-extrabold text-papel active:opacity-90"
              >
                {t("today.openMap")}
              </Link>
            </article>
          )}

          {!location && permission !== "denied" && (
            <button
              type="button"
              onClick={request}
              className="rounded-2xl border border-borde-2 bg-blanco px-4 py-3.5 text-[15px] font-bold text-tinta active:bg-papel-2 lg:col-span-2"
            >
              {t("today.distances")}
            </button>
          )}

          <p className="rounded-xl bg-papel px-3 py-2 text-[11px] leading-snug font-semibold text-aviso-txt lg:col-span-2">
            {t("today.sample")}
          </p>

          {/* --- Comercio destacado: vitrina pagada, y se dice --- */}
          {featured && (
            <Link
              href="/"
              className="rounded-2xl border border-dashed border-[#d8b96a] bg-papel px-4 py-3.5 lg:col-span-2"
            >
              <span className="mb-2 inline-block rounded-[5px] bg-[#f0e2b8] px-[7px] py-[3px] text-[10px] font-extrabold tracking-[1.4px] text-[#8a7020]">
                {t("card.ad")} · {t("today.nearCourse")}
              </span>
              <h3 className="text-base font-extrabold text-tinta">{featured.name}</h3>
              <p className="mt-0.5 text-[13px] text-tinta-3">
                {featured.offer ?? featured.description}
                {location &&
                  t("card.away", {
                    d: shortDistance(haversineDistance(location.lat, location.lng, featured.lat, featured.lng)),
                  })}
              </p>
            </Link>
          )}

          {programacion && !esHoy && day && (
            <p className="text-[13px] font-bold text-tinta-2 lg:col-span-2">
              {t("today.next", { date: dateParts(day).long })}
            </p>
          )}
          {programacion && events.length === 0 && (
            <p className="text-[14px] text-tinta-3 lg:col-span-2">{t("today.nothing")}</p>
          )}

          {/* --- Resto del día --- */}
          {events.map((e) =>
            e.sponsored ? (
              <article
                key={e.id}
                className="rounded-2xl border border-dashed border-[#d8b96a] bg-papel px-4 py-3.5"
              >
                {/* Lo patrocinado se marca. Disfrazarlo rompe la confianza que es
                    justamente lo que se le vende al anunciante. */}
                <span className="mb-3 inline-block rounded-[5px] bg-[#f0e2b8] px-[7px] py-[3px] text-[10px] font-extrabold tracking-[1.4px] text-[#8a7020]">
                  {t("card.ad")}
                </span>
                <div className="flex items-center gap-3.5">
                  <span
                    className="fuente-display grid size-11 shrink-0 place-items-center rounded-xl bg-marca text-xl text-papel"
                    aria-hidden
                  >
                    {e.title.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-extrabold text-tinta">{e.title}</h3>
                    <p className="mt-0.5 flex gap-1 text-[13px] text-tinta-3">
                      <span className="truncate">{e.placeName}</span>
                      {e.distanceM !== null && (
                        <span className="shrink-0">{t("card.away", { d: shortDistance(e.distanceM) })}</span>
                      )}
                    </p>
                  </div>
                </div>
              </article>
            ) : (
              <article
                key={e.id}
                className={`flex items-center gap-3.5 rounded-2xl border border-borde bg-blanco px-4 py-3.5 ${
                  e.yaPaso ? "opacity-55" : ""
                }`}
              >
                <div className="w-[52px] shrink-0 text-center">
                  <div className="text-lg font-extrabold text-tinta">{e.startTime}</div>
                  {esHoy && (
                  <div
                    className={`text-[11px] font-bold tracking-[1px] uppercase ${
                      e.inFlight ? "text-cabeza-txt" : e.yaPaso ? "text-tinta-4" : "text-cola"
                    }`}
                  >
                    {e.inFlight ? t("today.now") : e.yaPaso ? t("today.over") : t("today.comingUp")}
                  </div>
                  )}
                </div>

                <div className="h-[38px] w-px shrink-0 bg-borde" aria-hidden />

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[17px] font-extrabold text-tinta">{e.title}</h3>
                  {/* El lugar se recorta si hace falta; la distancia no: es el dato
                      por el que se mira esta lista. */}
                  <p className="mt-0.5 flex gap-1 text-[13px] text-tinta-3">
                    <span className="truncate">{e.placeName}</span>
                    {e.distanceM !== null && (
                      <span className="shrink-0">{t("card.away", { d: shortDistance(e.distanceM) })}</span>
                    )}
                  </p>
                  {e.yaPaso && e.endTime && (
                    <p className="mt-0.5 text-[12px] text-tinta-4">
                      {t("today.ended", { time: timeOfDay(e.endTime) })}
                    </p>
                  )}
                </div>
              </article>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
