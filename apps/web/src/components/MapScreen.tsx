"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Announcements } from "@/components/Announcements";
import { EtaBar } from "@/components/EtaBar";
import { Home } from "@/components/Home";
import type { Framing, MapPoint } from "@/components/ParadeMap";
import { PointCard } from "@/components/PointCard";
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

const ParadeMap = dynamic(() => import("@/components/ParadeMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-paper-2" />,
});

const LAYERS = [
  { id: "parade", key: "layer.parade", color: "#ff6a1f" },
  { id: "business", key: "layer.businesses", color: "#2fa898" },
  { id: "stage", key: "layer.stages", color: "#a06bff" },
  { id: "servicio", key: "layer.services", color: "#1487cc" },
] as const;

type LayerId = (typeof LAYERS)[number]["id"];

const HOME_SEEN_KEY = "sed:inicio-visto";
const OFFER_RADIUS_M = 300;

function offerActive(c: Business, state: ParadeState | null): boolean {
  if (!c.plan || !c.offer) return false;
  if (c.offerTiming === "always") return true;
  const front = projectOnCourse(c.lat, c.lng).metres;
  const head = state?.positions.head?.metres ?? null;
  const tail = state?.positions.tail?.metres ?? head;
  if (c.offerTiming === "before") return head === null || head < front;
  return tail !== null && tail > front;
}

export function MapScreen() {
  const { t } = useLanguage();
  const { state, connection, clockOffsetMs } = useParadeState();
  const { location, permission, errorMessage, request, setManual, clearManual } = useUserLocation();
  const localClock = useClock(5000);
  const [marking, setMarking] = useState(false);
  const [layers, setLayers] = useState<Set<LayerId>>(new Set<LayerId>(["parade"]));
  const [framing, setFraming] = useState<Framing | null>(null);
  const [homeSeen, setHomeSeen] = useState<boolean | null>(null);
  const [showCrowd, setShowCrowd] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [meetingM, setMeetingM] = useState<number | null>(null);
  const [offerDismissed, setOfferDismissed] = useState<string | null>(null);
  const businesses = useBusinesses(true);
  const schedule = useSchedule();

  useEffect(() => {
    try {
      setHomeSeen(localStorage.getItem(HOME_SEEN_KEY) === "1");
    } catch {
      setHomeSeen(true);
    }
    const m = Number(new URLSearchParams(window.location.search).get("meet"));
    if (Number.isFinite(m) && m > 0 && m <= COURSE.lengthMetres) setMeetingM(m);
  }, []);

  const markHomeSeen = useCallback(() => {
    try {
      localStorage.setItem(HOME_SEEN_KEY, "1");
    } catch {}
    setHomeSeen(true);
  }, []);

  const now = localClock + clockOffsetMs;
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

  const hasServices = businesses.some((c) => isService(c.category));

  const points = useMemo<MapPoint[]>(() => {
    const list: MapPoint[] = [];

    if (layers.has("stage") && schedule) {
      const day = state?.date ?? schedule.today;
      for (const e of schedule.events) {
        if (e.category !== "stage" || e.date !== day || e.lat === null || e.lng === null) continue;
        list.push({
          id: e.id,
          name: e.title,
          lat: e.lat,
          lng: e.lng,
          category: e.category,
          group: "stage",
          description: e.description,
          address: e.placeName,
          hours: e.endTime ? `${e.startTime} – ${e.endTime}` : e.startTime,
        });
      }
    }

    for (const c of businesses) {
      const service = isService(c.category);
      if (!layers.has(service ? "servicio" : "business")) continue;
      list.push({
        id: c.id,
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        category: c.category,
        group: service ? "servicio" : "business",
        description: c.description,
        address: c.address,
        hours: c.hours,
        offer: offerActive(c, state) ? c.offer : null,
        plan: c.plan,
        menu: c.menu,
        whatsapp: c.whatsapp,
        link: c.link,
      });
    }

    return list;
  }, [layers, businesses, schedule, state]);

  useEffect(() => {
    if (selectedPoint && !points.some((p) => p.id === selectedPoint.id)) setSelectedPoint(null);
  }, [points, selectedPoint]);

  const pointDistance =
    selectedPoint && location
      ? haversineDistance(location.lat, location.lng, selectedPoint.lat, selectedPoint.lng)
      : null;

  const toggleLayer = (id: LayerId) =>
    setLayers((earlier) => {
      const next = new Set(earlier);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { density, share, decideShare } = useDensity(showCrowd, userMetres);

  const suggestions = useMemo(() => {
    if (!showCrowd || !density?.enough || !state) return [];
    const head = state.positions.head?.metres ?? 0;
    return density.bins
      .filter((b) => b.level === "calm" && b.fromM > head + 150)
      .map((b) => {
        const centre = b.fromM + BIN_M / 2;
        const e = computeEta({ state, userMetres: centre, userOffsetM: 0, maxOffsetM: MAX_USER_OFFSET_M, now });
        return {
          centre,
          place: nearestWaypoint(centre)?.name ?? "",
          arrives: e.kind === "arriving" ? { a: e.minMin, b: e.maxMin } : null,
          sorted: Math.abs(centre - (userMetres ?? head)),
        };
      })
      .sort((a, b) => a.sorted - b.sorted)
      .slice(0, 3);
  }, [showCrowd, density, state, userMetres, now]);

  const nearbyOffer = useMemo(() => {
    if (!location || selectedPoint) return null;
    let best: { c: Business; d: number } | null = null;
    for (const c of businesses) {
      if (c.plan !== "featured" || c.id === offerDismissed || !offerActive(c, state)) continue;
      const d = haversineDistance(location.lat, location.lng, c.lat, c.lng);
      if (d <= OFFER_RADIUS_M && (!best || d < best.d)) best = { c, d };
    }
    return best;
  }, [location, businesses, state, offerDismissed, selectedPoint]);

  const offerId = nearbyOffer?.c.id ?? null;
  useEffect(() => {
    if (offerId) countMetric(offerId, "offer");
  }, [offerId]);

  const reframe = (mode: "all" | "me" | "head") => setFraming({ mode, nonce: Date.now() });
  const goTo = (lat: number, lng: number) => setFraming({ mode: "point", lat, lng, nonce: Date.now() });

  if (homeSeen === null) return <div className="fixed inset-0 z-50 bg-brand" />;

  if (!homeSeen) {
    return (
      <div className="fixed inset-0 z-50">
        <Home
          onFollow={() => {
            request();
            markHomeSeen();
          }}
          onSkip={markHomeSeen}
        />
      </div>
    );
  }

  const chip = (isActive: boolean) =>
    `pointer-events-auto flex h-[34px] shrink-0 items-center gap-1.5 rounded-[17px] px-3 text-[13px] font-bold ${
      isActive
        ? "bg-ink text-paper shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)]"
        : "bg-white text-ink-2 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.25)]"
    }`;
  const card = "pointer-events-auto mx-auto max-w-lg lg:mx-0 lg:max-w-[420px]";

  return (
    <div className="absolute inset-0 flex flex-col">
      <ParadeMap
        state={state}
        points={points}
        density={showCrowd ? density : null}
        pickedPoint={selectedPoint?.id ?? null}
        onPointClick={setSelectedPoint}
        location={location}
        now={now}
        pickingPoint={marking}
        onPointPicked={(lat, lng) => {
          setManual(lat, lng);
          setMarking(false);
        }}
        framing={framing}
        meetingM={meetingM}
      />

      <header className="pt-safe pointer-events-none relative z-10 px-3.5">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-2.5 rounded-[18px] bg-white px-4 py-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.28)] lg:mx-0 lg:max-w-md">
          <span
            className="grid size-[22px] shrink-0 place-items-center rounded-md bg-brand"
            aria-hidden
          >
            <span className="size-[9px] rounded-full bg-paper" />
          </span>
          <h1 className="display-font truncate text-[17px] text-ink">
            {state?.name ?? "Sigue el Desfile"}
          </h1>
          {state?.state === "in_progress" && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-extrabold text-ok">
              <span className="heartbeat size-2 rounded-full bg-ok" aria-hidden />
              {t("map.live")}
            </span>
          )}
        </div>
      </header>

      {state && state.announcements.length > 0 && (
        <div className="pointer-events-none relative z-10 mt-2 px-3.5">
          <div className="pointer-events-auto mx-auto max-w-lg lg:mx-0 lg:max-w-md">
            <Announcements announcements={state.announcements} />
          </div>
        </div>
      )}

      <div className="pointer-events-none relative z-10 mt-2.5 flex gap-[7px] overflow-x-auto px-3 pb-1 lg:flex-wrap lg:overflow-visible lg:pl-3.5">
        {LAYERS.filter((c) => c.id !== "servicio" || hasServices).map((c) => {
          const isActive = layers.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleLayer(c.id)}
              aria-pressed={isActive}
              className={chip(isActive)}
            >
              {c.id === "parade" ? (
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

        <button
          type="button"
          onClick={() => setShowCrowd((v) => !v)}
          aria-pressed={showCrowd}
          className={chip(showCrowd)}
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
        <p className="pointer-events-none relative z-10 mx-3 mt-1.5 self-start rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-warn-text shadow-sm">
          {t("map.provisional")}
        </p>
      )}

      {meetingM !== null && (
        <p className="pointer-events-auto relative z-10 mx-3 mt-1.5 self-start rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-semibold text-paper shadow-sm">
          {t("map.meetingPoint")}: {describePosition(meetingM, "you", t).phrase.replace(/^(estás|you're) /, "")}.{" "}
          <button type="button" onClick={() => setMeetingM(null)} className="underline underline-offset-2">
            {t("map.remove")}
          </button>
        </p>
      )}

      <div className="pointer-events-none relative z-10 mt-auto flex items-end justify-between gap-2 px-3.5 pb-2.5 lg:justify-end lg:gap-3 lg:pb-5">
        <div className="flex flex-col items-start gap-2.5">
          <button
            type="button"
            onClick={() => reframe("head")}
            className="pointer-events-auto flex h-11 items-center gap-2 rounded-[22px] bg-ink px-4 text-sm font-bold text-paper shadow-[0_6px_16px_-4px_rgba(0,0,0,0.4)] active:opacity-90"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--color-head)" aria-hidden>
              <path d="M6 3l12 9-12 9z" />
            </svg>
            {t("map.takeMe")}
          </button>

          <button
            type="button"
            onClick={() => (location ? reframe("me") : request())}
            aria-label={location ? t("map.center") : t("map.useLocation")}
            className="pointer-events-auto grid size-11 place-items-center rounded-full border-[1.5px] border-line-2 bg-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.3)] active:bg-paper-2"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-user)"
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

      {showCrowd && share === "undecided" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${card} rounded-2xl border border-line-2 bg-white p-3.5 shadow-lg`}>
            <p className="text-sm font-bold text-ink">{t("crowd.question")}</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-3">{t("crowd.explain")}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => decideShare("yes")}
                className="flex-1 rounded-full bg-ink px-3 py-2.5 text-[13px] font-bold text-paper"
              >
                {t("crowd.yes")}
              </button>
              <button
                type="button"
                onClick={() => decideShare("no")}
                className="flex-1 rounded-full border border-line-2 px-3 py-2.5 text-[13px] font-bold text-ink"
              >
                {t("crowd.no")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCrowd && share !== "undecided" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${card} rounded-xl bg-white/95 px-3 py-2 shadow-md`}>
            {density?.enough ? (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-ink-3">
                  {(["calm", "busy", "full"] as const).map((n) => (
                    <span key={n} className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: LEVEL_COLOR[n] }} aria-hidden />
                      {t(`crowd.${n}`)}
                    </span>
                  ))}
                  <span className="text-ink-4">· {t("crowd.people", { n: density.total })}</span>
                  <button
                    type="button"
                    aria-expanded={showSuggestions}
                    onClick={() => setShowSuggestions((v) => !v)}
                    className="ml-auto rounded-full bg-ink px-3 py-1 text-[12px] font-bold text-paper"
                  >
                    {t("crowd.where")}
                  </button>
                </div>
                {showSuggestions && (
                  <div className="mt-2 border-t border-line pt-2">
                    {suggestions.length === 0 ? (
                      <p className="text-[12px] font-semibold text-ink-3">{t("crowd.noSuggestions")}</p>
                    ) : (
                      <ul className="space-y-1">
                        {suggestions.map((s) => {
                          const p = pointAtMetre(s.centre);
                          return (
                            <li key={s.centre}>
                              <button
                                type="button"
                                onClick={() => goTo(p.lat, p.lng)}
                                className="w-full rounded-lg px-1 py-1 text-left text-[13px] text-ink active:bg-paper-2"
                              >
                                <b>{t("crowd.suggestion", { place: s.place })}</b>
                                {s.arrives && (
                                  <span className="text-ink-3"> · {t("crowd.arrivesIn", s.arrives)}</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="mt-1.5 text-[11px] leading-snug text-ink-4">{t("crowd.notice")}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[12px] leading-snug font-semibold text-ink-3">
                {t("crowd.notEnough", {
                  min: MIN_USERS_GLOBAL,
                  current: density ? t("crowd.current", { n: density.total }) : "",
                })}
              </p>
            )}
          </div>
        </div>
      )}

      {nearbyOffer && !marking && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${card} flex items-center gap-2.5 rounded-2xl border border-dashed border-[#d8b96a] bg-paper px-3.5 py-2.5 shadow-md`}>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setLayers((c) => new Set(c).add("business"));
                const c = nearbyOffer.c;
                setSelectedPoint({
                  id: c.id, name: c.name, lat: c.lat, lng: c.lng, category: c.category, group: "business",
                  description: c.description, address: c.address, hours: c.hours, offer: c.offer,
                  plan: c.plan, menu: c.menu, whatsapp: c.whatsapp, link: c.link,
                });
                goTo(c.lat, c.lng);
              }}
            >
              <span className="text-[10px] font-extrabold tracking-[1.2px] text-[#8a7020]">
                {t("card.ad")} · {t("offer.nearby")}
              </span>
              <span className="block truncate text-[14px] font-extrabold text-ink">{nearbyOffer.c.offer}</span>
              <span className="block truncate text-[12px] text-ink-3">{nearbyOffer.c.name}</span>
            </button>
            <button
              type="button"
              aria-label={t("card.close")}
              onClick={() => setOfferDismissed(nearbyOffer.c.id)}
              className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 active:bg-paper-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {marking && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <p className={`${card} rounded-xl border border-user/40 bg-white px-3 py-2.5 text-center text-[13px] text-ink shadow-md`}>
            {t("map.tapWhere")}{" "}
            <button
              type="button"
              onClick={() => setMarking(false)}
              className="font-bold underline underline-offset-2"
            >
              {t("map.cancel")}
            </button>
          </p>
        </div>
      )}

      {!marking && errorMessage && permission !== "granted" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <p className="mx-auto max-w-lg rounded-xl bg-white px-3 py-2 text-center text-[12px] text-ink-2 shadow-md lg:mx-0 lg:max-w-[420px]">
            {errorMessage}
          </p>
        </div>
      )}

      {!marking && location?.manual && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-1.5">
          <p className={`${card} text-center text-[12px] font-semibold text-ink-3`}>
            {describePosition(location.projection.metres, "you", t).phrase || t("map.manualSpot")}
            .{" "}
            <button type="button" onClick={clearManual} className="underline underline-offset-2">
              {t("map.useGps")}
            </button>
          </p>
        </div>
      )}

      <div className="relative z-10 lg:mb-5 lg:ml-3.5 lg:w-[420px]">
        {selectedPoint ? (
          <PointCard
            point={selectedPoint}
            distanceM={pointDistance}
            onClose={() => setSelectedPoint(null)}
            onTakeMe={() => goTo(selectedPoint.lat, selectedPoint.lng)}
          />
        ) : (
          <EtaBar
            eta={eta}
            state={state}
            connection={connection}
            now={now}
            userMetres={
              location && location.projection.offsetM <= MAX_USER_OFFSET_M ? userMetres : null
            }
            onRequestLocation={request}
            onPickPoint={() => setMarking(true)}
          />
        )}
      </div>
    </div>
  );
}
