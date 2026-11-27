"use client";

import { useState } from "react";

import type { Eta } from "@/lib/eta";
import { shortDistance, timeAgo, shortTime } from "@/lib/format";
import { useProximityAlert } from "@/lib/hooks/useProximityAlert";
import type { Connection } from "@/lib/hooks/useParadeState";
import { useLanguage, type Translator } from "@/lib/i18n";
import { describePosition } from "@/lib/course";
import type { ParadeState } from "@/lib/types";

interface Props {
  eta: Eta;
  state: ParadeState | null;
  connection: Connection;
  now: number;
  /** Metros del usuario sobre la senda; null si no dio ubicación. */
  userMetres: number | null;
  onPedirUbicacion: () => void;
  onMarcarPunto: () => void;
}

/**
 * La hoja blanca de abajo. Es el producto: responde la única pregunta que
 * importa. El diseño resolvió el estado feliz; los demás están escritos en el
 * mismo registro pastuso, que es el que da el diseño.
 */

const kmh = (v: number) => v.toFixed(1).replace(".", ",");

function Titular({ eta, t }: { eta: Eta; t: Translator }) {
  const base = "text-[26px] leading-[1.12] font-extrabold tracking-[-0.3px] text-tinta";

  switch (eta.kind) {
    case "arriving":
      return (
        <p className={base}>
          {t("eta.arriving")}{" "}
          <span className="text-cabeza-txt">
            {eta.minMin}–{eta.maxMin} min
          </span>
        </p>
      );
    case "stopped":
      return (
        <p className={base}>
          <span className="text-alerta">{t("eta.stopped")}</span>
          <span className="text-tinta-2">{t("eta.stopped.for", { n: eta.stoppedForMin })}</span>
        </p>
      );
    case "no_signal":
      // Sin un tiempo a propósito: sería calcular sobre dónde ESTABA el desfile.
      return <p className={`${base} text-aviso-txt`}>{t("eta.noSignal", { n: eta.agoMin })}</p>;
    case "here":
      return <p className={`${base} text-cabeza-txt`}>{t("eta.here")}</p>;
    case "passed":
      return (
        <p className={base}>
          {eta.tailPassed ? (
            t("eta.allPassed")
          ) : (
            <>
              {t("eta.headPassed")}
              {eta.tailDistanceM !== null && (
                <span className="text-tinta-2">
                  {t("eta.tailAt", { d: shortDistance(eta.tailDistanceM) })}
                </span>
              )}
            </>
          )}
        </p>
      );
    case "no_data":
      if (eta.reason === "no_location") return <p className={base}>{t("eta.whereAreYou")}</p>;
      if (eta.reason === "off_course") return <p className={base}>{t("eta.far")}</p>;
      return <p className={base}>{t("eta.notStarted")}</p>;
  }
}

function Detalle({ eta, t }: { eta: Eta; t: Translator }) {
  // "Termina de pasar en…": la otra mitad de la pregunta, para quien ya lo tiene encima.
  const tail =
    "tailIn" in eta && eta.tailIn ? (
      <> {t("eta.tailIn", { a: eta.tailIn.minMin, b: eta.tailIn.maxMin })}</>
    ) : null;

  switch (eta.kind) {
    case "arriving":
      return (
        <>
          {t("eta.d.itIs", { d: shortDistance(eta.distanceM) })}
          {t(eta.speedMeasured ? "eta.d.measured" : "eta.d.estimated", { v: kmh(eta.speedKmh) })}
          {eta.notMovingMin !== null && (
            <span className="font-semibold text-aviso-txt">
              {t("eta.d.notMoving", { n: eta.notMovingMin })}
            </span>
          )}
          .{tail}
        </>
      );
    case "stopped":
      return <>{t("eta.d.headAt", { d: shortDistance(eta.distanceM) })}</>;
    case "no_signal":
      return <>{t("eta.d.noSignal", { d: shortDistance(eta.distanceM) })}</>;
    case "here":
      return (
        <>
          {t("eta.d.youAt", { d: shortDistance(eta.distanceM) })}
          {tail}
        </>
      );
    case "passed":
      return (
        <>
          {t("eta.d.ahead", { d: shortDistance(eta.headDistanceM) })}
          {tail}
        </>
      );
    case "no_data":
      if (eta.reason === "no_location") return <>{t("eta.d.noLocation")}</>;
      if (eta.reason === "off_course") return <>{t("eta.d.comeCloser")}</>;
      return <>{t("eta.d.noReports")}</>;
  }
}

const COLOR_CONEXION: Record<Connection, string> = {
  connecting: "text-tinta-3",
  live: "text-ok",
  retrying: "text-aviso-txt",
  offline: "text-alerta",
};

const PUNTO_CONEXION: Record<Connection, string> = {
  connecting: "bg-tinta-4",
  live: "bg-ok latido",
  retrying: "bg-mitad",
  offline: "bg-alerta",
};

export function BarraEta({
  eta,
  state,
  connection,
  now,
  userMetres,
  onPedirUbicacion,
  onMarcarPunto,
}: Props) {
  const { t } = useLanguage();
  const [copiado, setCopiado] = useState(false);
  const head = state?.positions.head ?? null;
  // En referencias que la gente reconoce, no en nombres de calle.
  const referencia = head ? describePosition(head.metres, "it", t) : null;
  const necesitaUbicacion = eta.kind === "no_data" && eta.reason !== "no_report";

  const { alert, enable, disable } = useProximityAlert(
    eta,
    t("alert.title", { name: state?.name ?? "" }),
    (n) => t("alert.body", { n }),
  );
  // El aviso solo tiene sentido si el desfile todavía viene hacia el usuario.
  const puedeAvisar =
    userMetres !== null && (eta.kind === "arriving" || eta.kind === "stopped" || eta.kind === "no_signal");

  const share = async () => {
    if (userMetres === null) return;
    const url = `${window.location.origin}/?encuentro=${Math.round(userMetres)}`;
    const text = t("eta.shareText", {
      where: describePosition(userMetres, "you", t).phrase.replace(/^(estás|you're) /, ""),
      eta: eta.kind === "arriving" ? t("eta.shareEta", { a: eta.minMin, b: eta.maxMin }) : "",
    });
    try {
      if (navigator.share) await navigator.share({ text: text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      }
    } catch {
      // Canceló el menú de compartir: no es un error.
    }
  };

  return (
    <div className="rounded-t-[26px] bg-blanco px-5 pt-5 pb-4 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.28)] lg:rounded-[26px] lg:border lg:border-borde-2 lg:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.34)]">
      <div className="mx-auto max-w-lg">
        <div aria-live="polite">
          <Titular eta={eta} t={t} />
        </div>

        <p className="mt-2 text-[15px] leading-snug text-tinta-2">
          <Detalle eta={eta} t={t} />
        </p>

        {necesitaUbicacion && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onPedirUbicacion}
              className="flex-1 rounded-full bg-tinta px-4 py-3 text-sm font-bold text-papel active:opacity-90"
            >
              {t("map.useLocation")}
            </button>
            <button
              type="button"
              onClick={onMarcarPunto}
              className="flex-1 rounded-full border border-borde-2 bg-blanco px-4 py-3 text-sm font-bold text-tinta active:bg-papel-2"
            >
              {t("map.mark")}
            </button>
          </div>
        )}

        {userMetres !== null && !necesitaUbicacion && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {puedeAvisar && alert.mode === "off" && (
              <button
                type="button"
                onClick={() => void enable(userMetres)}
                className="flex h-10 items-center gap-2 rounded-full bg-tinta px-4 text-[13px] font-bold text-papel active:opacity-90"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-mitad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0" />
                </svg>
                {t("eta.notifyMe")}
              </button>
            )}
            {(alert.mode === "push" || alert.mode === "local") && (
              <p className="flex min-h-10 items-center gap-2 rounded-2xl bg-papel px-3.5 py-1.5 text-[13px] font-semibold text-tinta-2">
                {t(alert.mode === "push" ? "eta.alertSet" : "eta.alertSetKeepOpen", { n: alert.thresholdMin })}
                <button type="button" onClick={() => void disable()} className="shrink-0 font-bold underline underline-offset-2">
                  {t("eta.alertRemove")}
                </button>
              </p>
            )}
            {alert.mode === "denied" && (
              <p className="text-[13px] font-semibold text-aviso-txt">{t("eta.alertDenied")}</p>
            )}
            <button
              type="button"
              onClick={() => void share()}
              className="flex h-10 items-center gap-2 rounded-full border border-borde-2 bg-blanco px-4 text-[13px] font-bold text-tinta active:bg-papel-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 15V3m0 0L8 7m4-4l4 4M5 12v7h14v-7" />
              </svg>
              {copiado ? t("eta.copied") : t("eta.share")}
            </button>
          </div>
        )}

        {/* De dónde salió este dato y cuándo. Nunca un spinner sin explicación. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-borde pt-3 text-[13px] text-tinta-3">
          <span className={`inline-flex items-center gap-1.5 font-bold ${COLOR_CONEXION[connection]}`}>
            <span className={`size-2 rounded-full ${PUNTO_CONEXION[connection]}`} aria-hidden />
            {t(`eta.connection.${connection}`)}
          </span>
          <span className="text-borde-3" aria-hidden>
            ·
          </span>
          {head ? (
            <>
              <span>{t("eta.lastReport", { ago: timeAgo(head.ts, now, t), time: shortTime(head.ts) })}</span>
              {referencia?.phrase && (
                <>
                  <span className="text-borde-3" aria-hidden>
                    ·
                  </span>
                  <span className="truncate font-semibold text-tinta-2">{referencia.phrase}</span>
                </>
              )}
            </>
          ) : (
            <span>{t("eta.noReportsYet")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
