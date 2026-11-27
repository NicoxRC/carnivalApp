"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Avisos } from "@/components/Avisos";
import { BarraEta } from "@/components/BarraEta";
import { Inicio } from "@/components/Inicio";
import type { Encuadre, PuntoMapa } from "@/components/MapaDesfile";
import { FichaPunto } from "@/components/FichaPunto";
import { isService } from "@/lib/businesses";
import { LEVEL_COLOR, BIN_M, MIN_USERS_GLOBAL } from "@/lib/density";
import { computeEta } from "@/lib/eta";
import { haversineDistance } from "@/lib/geo";
import { useBusinesses } from "@/lib/hooks/useBusinesses";
import { useParadeState, useClock } from "@/lib/hooks/useParadeState";
import { useDensity } from "@/lib/hooks/useDensity";
import { useSchedule } from "@/lib/hooks/useSchedule";
import { useUserLocation } from "@/lib/hooks/useUserLocation";
import { useLanguage } from "@/lib/i18n";
import { countMetric } from "@/lib/metrics";
import { MAX_USER_OFFSET_M, nearestWaypoint, projectOnCourse, pointAtMetre, describePosition, COURSE } from "@/lib/course";
import type { Business, ParadeState } from "@/lib/types";

// MapLibre toca `window` al importarse: fuera del render del servidor.
const MapaDesfile = dynamic(() => import("@/components/MapaDesfile"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-papel-2" />,
});

/**
 * Las capas del mapa.
 *
 * "Comercios" reúne restaurantes, tascas, cafés, tiendas y droguerías: para
 * alguien parado en la senda todos responden la misma pregunta —dónde como,
 * dónde compro— y separarlos en cinco filtros solo añade trabajo. El icono
 * distingue de qué tipo es cada uno.
 *
 * "Servicios" (baños, agua, primeros auxilios) solo aparece si el equipo cargó
 * alguno desde el panel: un baño inventado en un mapa que alguien usa para
 * buscar un baño es peor que no ofrecer el filtro.
 */
const CAPAS = [
  { id: "desfile", key: "layer.parade", color: "#ff6a1f" },
  { id: "comercio", key: "layer.businesses", color: "#2fa898" },
  { id: "stage", key: "layer.stages", color: "#a06bff" },
  { id: "servicio", key: "layer.services", color: "#1487cc" },
] as const;

type CapaId = (typeof CAPAS)[number]["id"];

const CLAVE_INICIO = "sed:inicio-visto";
/** Una oferta "cerca" es una a la que se llega caminando sin perder el puesto. */
const RADIO_OFERTA_M = 300;

/**
 * ¿Se muestra ahora la oferta de este comercio? Con "antes"/"después" depende
 * de si el desfile ya pasó frente a él: «2x1 en hervidos cuando pase el desfile».
 */
function promoVigente(c: Business, state: ParadeState | null): boolean {
  if (!c.plan || !c.offer) return false;
  if (c.offerTiming === "always") return true;
  const frente = projectOnCourse(c.lat, c.lng).metres;
  const head = state?.positions.head?.metres ?? null;
  const tail = state?.positions.tail?.metres ?? head;
  if (c.offerTiming === "before") return head === null || head < frente;
  return tail !== null && tail > frente;
}

export function PantallaMapa() {
  const { t } = useLanguage();
  const { state, connection, clockOffsetMs } = useParadeState();
  const { location, permission, errorMessage, request, setManual, clearManual } = useUserLocation();
  // Cada 5 s y no cada segundo: esta pantalla entera se redibuja con el reloj,
  // y un "hace 23 s" que salta de 5 en 5 se lee igual gastando menos batería.
  const relojLocal = useClock(5000);
  const [marcando, setMarcando] = useState(false);
  const [layers, setCapas] = useState<Set<CapaId>>(new Set<CapaId>(["desfile"]));
  const [encuadre, setEncuadre] = useState<Encuadre | null>(null);
  // null = todavía no sabemos si ya vio el inicio (localStorage solo existe tras montar).
  const [inicioVisto, setInicioVisto] = useState<boolean | null>(null);
  const [verGentio, setVerGentio] = useState(false);
  const [verSugerencias, setVerSugerencias] = useState(false);
  const [puntoSel, setPuntoSel] = useState<PuntoMapa | null>(null);
  const [encuentroM, setEncuentroM] = useState<number | null>(null);
  const [ofertaCerrada, setOfertaCerrada] = useState<string | null>(null);
  const businesses = useBusinesses(true);
  const programacion = useSchedule();

  useEffect(() => {
    try {
      setInicioVisto(localStorage.getItem(CLAVE_INICIO) === "1");
    } catch {
      // localStorage bloqueado: se salta el inicio en vez de repetirlo cada vez.
      setInicioVisto(true);
    }
    // «Estoy acá»: alguien compartió su punto de la senda.
    const m = Number(new URLSearchParams(window.location.search).get("encuentro"));
    if (Number.isFinite(m) && m > 0 && m <= COURSE.lengthMetres) setEncuentroM(m);
  }, []);

  const marcarInicioVisto = useCallback(() => {
    try {
      localStorage.setItem(CLAVE_INICIO, "1");
    } catch {
      // sin persistencia: vale para esta sesión
    }
    setInicioVisto(true);
  }, []);

  // El reloj del celular puede estar corrido. Los "hace X min" se calculan
  // contra el reloj del servidor para que no mientan.
  const now = relojLocal + clockOffsetMs;
  const userMetres = location?.projection.metres ?? null;

  const eta = useMemo(() => {
    if (!state) return { kind: "no_data", reason: "no_report" } as const;
    return computeEta({
      state,
      userMetres,
      userOffsetM: location?.projection.offsetM ?? null,
      maxOffsetM: MAX_USER_OFFSET_M,
      now,
    });
  }, [state, userMetres, location, now]);

  const hayServicios = businesses.some((c) => isService(c.category));

  const points = useMemo<PuntoMapa[]>(() => {
    const list: PuntoMapa[] = [];

    if (layers.has("stage") && programacion) {
      // Las tarimas del día del desfile que se está siguiendo.
      const day = state?.date ?? programacion.today;
      for (const e of programacion.events) {
        if (e.category !== "stage" || e.date !== day || e.lat === null || e.lng === null) continue;
        list.push({
          id: e.id,
          name: e.title,
          lat: e.lat,
          lng: e.lng,
          category: e.category,
          grupo: "tarima",
          description: e.description,
          address: e.placeName,
          hours: e.endTime ? `${e.startTime} – ${e.endTime}` : e.startTime,
        });
      }
    }

    for (const c of businesses) {
      const servicio = isService(c.category);
      if (!layers.has(servicio ? "servicio" : "comercio")) continue;
      list.push({
        id: c.id,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        category: c.category,
        grupo: servicio ? "servicio" : "comercio",
        description: c.description,
        address: c.address,
        hours: c.hours,
        offer: promoVigente(c, state) ? c.offer : null,
        plan: c.plan,
        menu: c.menu,
        whatsapp: c.whatsapp,
        link: c.link,
      });
    }

    return list;
  }, [layers, businesses, programacion, state]);

  // Si se apaga la capa del punto abierto, la ficha se cierra con ella.
  useEffect(() => {
    if (puntoSel && !points.some((p) => p.id === puntoSel.id)) setPuntoSel(null);
  }, [points, puntoSel]);

  const distanciaAlPunto =
    puntoSel && location
      ? haversineDistance(location.lat, location.lng, puntoSel.lat, puntoSel.lng)
      : null;

  const alternarCapa = (id: CapaId) =>
    setCapas((previas) => {
      const next = new Set(previas);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { density, share, decideShare } = useDensity(verGentio, userMetres);

  /**
   * «¿Dónde me hago?»: tramos con campo, más adelante del desfile, con cuánto
   * falta para que llegue. Solo con muestra suficiente, y solo los tramos que
   * se SABE que están tranquilos: un tramo sin datos no se recomienda.
   */
  const sugerencias = useMemo(() => {
    if (!verGentio || !density?.enough || !state) return [];
    const head = state.positions.head?.metres ?? 0;
    return density.bins
      .filter((b) => b.level === "calm" && b.fromM > head + 150)
      .map((b) => {
        const centro = b.fromM + BIN_M / 2;
        const e = computeEta({ state, userMetres: centro, userOffsetM: 0, maxOffsetM: MAX_USER_OFFSET_M, now });
        return {
          centro,
          lugar: nearestWaypoint(centro)?.name ?? "",
          llega: e.kind === "arriving" ? { a: e.minMin, b: e.maxMin } : null,
          // Lo más cerca de donde ya está; si no dio ubicación, lo más próximo al desfile.
          sorted: Math.abs(centro - (userMetres ?? head)),
        };
      })
      .sort((a, b) => a.sorted - b.sorted)
      .slice(0, 3);
  }, [verGentio, density, state, userMetres, now]);

  /** La oferta de un comercio destacado que queda a pocos pasos. Una a la vez, y se puede cerrar. */
  const ofertaCerca = useMemo(() => {
    if (!location || puntoSel) return null;
    let best: { c: Business; d: number } | null = null;
    for (const c of businesses) {
      if (c.plan !== "featured" || c.id === ofertaCerrada || !promoVigente(c, state)) continue;
      const d = haversineDistance(location.lat, location.lng, c.lat, c.lng);
      if (d <= RADIO_OFERTA_M && (!best || d < best.d)) best = { c, d };
    }
    return best;
  }, [location, businesses, state, ofertaCerrada, puntoSel]);

  // Una impresión por oferta mostrada: es lo que se le cuenta al anunciante.
  const idOferta = ofertaCerca?.c.id ?? null;
  useEffect(() => {
    if (idOferta) countMetric(idOferta, "offer");
  }, [idOferta]);

  const reencuadrar = (mode: "todo" | "yo" | "head") => setEncuadre({ mode, nonce: Date.now() });
  const irA = (lat: number, lng: number) => setEncuadre({ mode: "punto", lat, lng, nonce: Date.now() });

  // Fondo de marca mientras se resuelve: evita que el mapa asome un frame
  // antes del inicio, y que el inicio asome para quien ya lo vio.
  // `fixed` y no `absolute`: el inicio va POR ENCIMA de la nav inferior, que
  // vive fuera de este componente. Es una pantalla previa a la app, no una pestaña.
  if (inicioVisto === null) return <div className="fixed inset-0 z-50 bg-marca" />;

  if (!inicioVisto) {
    return (
      <div className="fixed inset-0 z-50">
        <Inicio
          onSeguir={() => {
            request();
            marcarInicioVisto();
          }}
          onSaltar={marcarInicioVisto}
        />
      </div>
    );
  }

  const chip = (activa: boolean) =>
    `pointer-events-auto flex h-[34px] shrink-0 items-center gap-1.5 rounded-[17px] px-3 text-[13px] font-bold ${
      activa
        ? "bg-tinta text-papel shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)]"
        : "bg-blanco text-tinta-2 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.25)]"
    }`;
  const tarjeta = "pointer-events-auto mx-auto max-w-lg lg:mx-0 lg:max-w-[420px]";

  return (
    <div className="absolute inset-0 flex flex-col">
      <MapaDesfile
        state={state}
        points={points}
        density={verGentio ? density : null}
        puntoSeleccionado={puntoSel?.id ?? null}
        onPuntoClick={setPuntoSel}
        location={location}
        now={now}
        modoMarcarPunto={marcando}
        onPuntoMarcado={(lat, lng) => {
          setManual(lat, lng);
          setMarcando(false);
        }}
        encuadre={encuadre}
        encuentroM={encuentroM}
      />

      {/* --- Tarjeta de cabecera --- */}
      <header className="pt-seguro pointer-events-none relative z-10 px-3.5">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-2.5 rounded-[18px] bg-blanco px-4 py-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.28)] lg:mx-0 lg:max-w-md">
          <span
            className="grid size-[22px] shrink-0 place-items-center rounded-md bg-marca"
            aria-hidden
          >
            <span className="size-[9px] rounded-full bg-papel" />
          </span>
          <h1 className="fuente-display truncate text-[17px] text-tinta">
            {state?.name ?? "Sigue el Desfile"}
          </h1>
          {state?.state === "in_progress" && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-extrabold text-ok">
              <span className="latido size-2 rounded-full bg-ok" aria-hidden />
              {t("map.live")}
            </span>
          )}
        </div>
      </header>

      {/* --- Mensajes del equipo: lo primero que hay que leer --- */}
      {state && state.announcements.length > 0 && (
        <div className="pointer-events-none relative z-10 mt-2 px-3.5">
          <div className="pointer-events-auto mx-auto max-w-lg lg:mx-0 lg:max-w-md">
            <Avisos announcements={state.announcements} />
          </div>
        </div>
      )}

      {/* --- Capas del mapa --- */}
      <div className="pointer-events-none relative z-10 mt-2.5 flex gap-[7px] overflow-x-auto px-3 pb-1 lg:flex-wrap lg:overflow-visible lg:pl-3.5">
        {CAPAS.filter((c) => c.id !== "servicio" || hayServicios).map((c) => {
          const activa = layers.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => alternarCapa(c.id)}
              aria-pressed={activa}
              className={chip(activa)}
            >
              {c.id === "desfile" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill={c.color} aria-hidden>
                  <path d="M6 3l12 9-12 9z" />
                </svg>
              ) : (
                <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
              )}
              {t(c.key)}
            </button>
          );
        })}

        {/* El gentío es otra clase de capa: no es "qué hay", es "cómo está". */}
        <button
          type="button"
          onClick={() => setVerGentio((v) => !v)}
          aria-pressed={verGentio}
          className={chip(verGentio)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.2" />
            <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
            <path d="M16 14c2.5 0 5 1.6 5 5" />
          </svg>
          {t("layer.crowd")}
        </button>
      </div>

      {!COURSE.official && (
        <p className="pointer-events-none relative z-10 mx-3 mt-1.5 self-start rounded-lg bg-blanco/90 px-2.5 py-1 text-[11px] font-semibold text-aviso-txt shadow-sm">
          {t("map.provisional")}
        </p>
      )}

      {encuentroM !== null && (
        <p className="pointer-events-auto relative z-10 mx-3 mt-1.5 self-start rounded-lg bg-tinta px-2.5 py-1.5 text-[12px] font-semibold text-papel shadow-sm">
          {t("map.meetingPoint")}: {describePosition(encuentroM, "you", t).phrase.replace(/^(estás|you're) /, "")}.{" "}
          <button type="button" onClick={() => setEncuentroM(null)} className="underline underline-offset-2">
            {t("map.remove")}
          </button>
        </p>
      )}

      {/* --- Controles flotantes --- */}
      <div className="pointer-events-none relative z-10 mt-auto flex items-end justify-between gap-2 px-3.5 pb-2.5 lg:justify-end lg:gap-3 lg:pb-5">
        <div className="flex flex-col items-start gap-2.5">
          <button
            type="button"
            onClick={() => reencuadrar("head")}
            className="pointer-events-auto flex h-11 items-center gap-2 rounded-[22px] bg-tinta px-4 text-sm font-bold text-papel shadow-[0_6px_16px_-4px_rgba(0,0,0,0.4)] active:opacity-90"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--color-cabeza)" aria-hidden>
              <path d="M6 3l12 9-12 9z" />
            </svg>
            {t("map.takeMe")}
          </button>

          <button
            type="button"
            onClick={() => (location ? reencuadrar("yo") : request())}
            aria-label={location ? t("map.center") : t("map.useLocation")}
            className="pointer-events-auto grid size-11 place-items-center rounded-full border-[1.5px] border-borde-2 bg-blanco shadow-[0_6px_16px_-6px_rgba(0,0,0,0.3)] active:bg-papel-2"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-usuario)"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </button>
        </div>

      </div>

      {/* --- Gentío: consentimiento y estado de la muestra --- */}
      {verGentio && share === "undecided" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${tarjeta} rounded-2xl border border-borde-2 bg-blanco p-3.5 shadow-lg`}>
            <p className="text-sm font-bold text-tinta">{t("crowd.question")}</p>
            <p className="mt-1 text-[13px] leading-snug text-tinta-3">{t("crowd.explain")}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => decideShare("yes")}
                className="flex-1 rounded-full bg-tinta px-3 py-2.5 text-[13px] font-bold text-papel"
              >
                {t("crowd.yes")}
              </button>
              <button
                type="button"
                onClick={() => decideShare("no")}
                className="flex-1 rounded-full border border-borde-2 px-3 py-2.5 text-[13px] font-bold text-tinta"
              >
                {t("crowd.no")}
              </button>
            </div>
          </div>
        </div>
      )}

      {verGentio && share !== "undecided" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${tarjeta} rounded-xl bg-blanco/95 px-3 py-2 shadow-md`}>
            {density?.enough ? (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-tinta-3">
                  {(["calm", "busy", "full"] as const).map((n) => (
                    <span key={n} className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: LEVEL_COLOR[n] }} aria-hidden />
                      {t(`crowd.${n}`)}
                    </span>
                  ))}
                  <span className="text-tinta-4">· {t("crowd.people", { n: density.total })}</span>
                  <button
                    type="button"
                    aria-expanded={verSugerencias}
                    onClick={() => setVerSugerencias((v) => !v)}
                    className="ml-auto rounded-full bg-tinta px-3 py-1 text-[12px] font-bold text-papel"
                  >
                    {t("crowd.where")}
                  </button>
                </div>
                {verSugerencias && (
                  <div className="mt-2 border-t border-borde pt-2">
                    {sugerencias.length === 0 ? (
                      <p className="text-[12px] font-semibold text-tinta-3">{t("crowd.noSuggestions")}</p>
                    ) : (
                      <ul className="space-y-1">
                        {sugerencias.map((s) => {
                          const p = pointAtMetre(s.centro);
                          return (
                            <li key={s.centro}>
                              <button
                                type="button"
                                onClick={() => irA(p.lat, p.lng)}
                                className="w-full rounded-lg px-1 py-1 text-left text-[13px] text-tinta active:bg-papel-2"
                              >
                                <b>{t("crowd.suggestion", { place: s.lugar })}</b>
                                {s.llega && (
                                  <span className="text-tinta-3"> · {t("crowd.arrivesIn", s.llega)}</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {/* Mandar gente a un punto tiene un riesgo que decir "allá está lleno" no tiene. */}
                    <p className="mt-1.5 text-[11px] leading-snug text-tinta-4">{t("crowd.notice")}</p>
                  </div>
                )}
              </>
            ) : (
              /* Nunca pintar la senda "vacía" con cuatro usuarios: eso mandaría
                 gente a un sitio del que no se sabe nada. */
              <p className="text-[12px] leading-snug font-semibold text-tinta-3">
                {t("crowd.notEnough", {
                  min: MIN_USERS_GLOBAL,
                  current: density ? t("crowd.current", { n: density.total }) : "",
                })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- Oferta cerca: pauta, y se dice --- */}
      {ofertaCerca && !marcando && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${tarjeta} flex items-center gap-2.5 rounded-2xl border border-dashed border-[#d8b96a] bg-papel px-3.5 py-2.5 shadow-md`}>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setCapas((c) => new Set(c).add("comercio"));
                const c = ofertaCerca.c;
                setPuntoSel({
                  id: c.id, name: c.name, lat: c.lat, lng: c.lng, category: c.category, grupo: "comercio",
                  description: c.description, address: c.address, hours: c.hours, offer: c.offer,
                  plan: c.plan, menu: c.menu, whatsapp: c.whatsapp, link: c.link,
                });
                irA(c.lat, c.lng);
              }}
            >
              <span className="text-[10px] font-extrabold tracking-[1.2px] text-[#8a7020]">
                {t("card.ad")} · {t("offer.nearby")}
              </span>
              <span className="block truncate text-[14px] font-extrabold text-tinta">{ofertaCerca.c.offer}</span>
              <span className="block truncate text-[12px] text-tinta-3">{ofertaCerca.c.name}</span>
            </button>
            <button
              type="button"
              aria-label={t("card.close")}
              onClick={() => setOfertaCerrada(ofertaCerca.c.id)}
              className="grid size-8 shrink-0 place-items-center rounded-full text-tinta-3 active:bg-papel-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* --- Avisos --- */}
      {marcando && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <p className={`${tarjeta} rounded-xl border border-usuario/40 bg-blanco px-3 py-2.5 text-center text-[13px] text-tinta shadow-md`}>
            {t("map.tapWhere")}{" "}
            <button
              type="button"
              onClick={() => setMarcando(false)}
              className="font-bold underline underline-offset-2"
            >
              {t("map.cancel")}
            </button>
          </p>
        </div>
      )}

      {!marcando && errorMessage && permission !== "granted" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <p className="mx-auto max-w-lg rounded-xl bg-blanco px-3 py-2 text-center text-[12px] text-tinta-2 shadow-md lg:mx-0 lg:max-w-[420px]">
            {errorMessage}
          </p>
        </div>
      )}

      {!marcando && location?.manual && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-1.5">
          <p className={`${tarjeta} text-center text-[12px] font-semibold text-tinta-3`}>
            {/* Confirmarle dónde cree la app que está, con una referencia que
                reconozca: es la única forma de que detecte si se equivocó. */}
            {describePosition(location.projection.metres, "you", t).phrase || t("map.manualSpot")}
            .{" "}
            <button type="button" onClick={clearManual} className="underline underline-offset-2">
              {t("map.useGps")}
            </button>
          </p>
        </div>
      )}

      {/* --- Abajo: la ficha del comercio, o la respuesta a la pregunta que importa ---
          En escritorio deja de ser una hoja a todo el ancho y se vuelve una
          tarjeta anclada abajo a la izquierda: a 1.500 px, un titular de 26 px
          centrado en toda la pantalla se lee peor, no mejor. */}
      <div className="relative z-10 lg:mb-5 lg:ml-3.5 lg:w-[420px]">
        {puntoSel ? (
          <FichaPunto
            punto={puntoSel}
            distanceM={distanciaAlPunto}
            onCerrar={() => setPuntoSel(null)}
            onLlevame={() => irA(puntoSel.lat, puntoSel.lng)}
          />
        ) : (
          <BarraEta
            eta={eta}
            state={state}
            connection={connection}
            now={now}
            userMetres={
              location && location.projection.offsetM <= MAX_USER_OFFSET_M ? userMetres : null
            }
            onPedirUbicacion={request}
            onMarcarPunto={() => setMarcando(true)}
          />
        )}
      </div>
    </div>
  );
}
