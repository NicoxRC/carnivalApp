"use client";

import { useEffect, useMemo, useState } from "react";

import { minutosDeHora, partesDeFecha } from "@/lib/fecha";
import { horaCorta, horaDelDia } from "@/lib/formato";
import { useProgramacion } from "@/lib/hooks/useProgramacion";
import { useIdioma } from "@/lib/i18n";
import type { PasoPorHito } from "@/lib/recorrido";
import type { Desfile } from "@/lib/tipos";

interface Fila {
  id: string;
  hora: string;
  titulo: string;
  lugar: string;
  desfile: Desfile | null;
}

/**
 * La programación de todos los días: los desfiles (que se pueden seguir en el
 * mapa) y los demás eventos. De los desfiles que ya salieron se puede ver por
 * dónde pasó la cabeza y a qué hora.
 */
export function PantallaDesfiles() {
  const { t } = useIdioma();
  const programacion = useProgramacion();
  const [diaElegido, setDiaElegido] = useState<string | null>(null);

  const dias = useMemo(() => {
    if (!programacion) return [];
    const fechas = new Set([
      ...programacion.desfiles.map((d) => d.fecha),
      ...programacion.eventos.map((e) => e.fecha),
    ]);
    return [...fechas].filter(Boolean).sort();
  }, [programacion]);

  // Hoy, si cae dentro del Carnaval; si no, el próximo día con algo; si no, el primero.
  // `hoy` viene del servidor en hora de Pasto: con `toISOString()` (UTC), desde
  // las 7 p. m. la app marcaba como "hoy" el día siguiente.
  const dia =
    diaElegido ??
    (programacion
      ? dias.includes(programacion.hoy)
        ? programacion.hoy
        : (dias.find((d) => d > programacion.hoy) ?? dias[0] ?? null)
      : null);

  const filas = useMemo<Fila[]>(() => {
    if (!programacion || !dia) return [];
    return [
      ...programacion.desfiles
        .filter((d) => d.fecha === dia)
        .map((d) => ({ id: d.id, hora: d.horaInicio, titulo: d.nombre, lugar: "Senda del Carnaval", desfile: d })),
      ...programacion.eventos
        .filter((e) => e.fecha === dia)
        .map((e) => ({ id: e.id, hora: e.horaInicio, titulo: e.titulo, lugar: e.lugarNombre, desfile: null })),
    ].sort((a, b) => minutosDeHora(a.hora) - minutosDeHora(b.hora));
  }, [programacion, dia]);

  return (
    <div className="flex-1 bg-papel-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-seguro px-5 pb-3.5 lg:px-6 lg:pt-8">
          <h1 className="fuente-display text-[34px] leading-none text-tinta">{t("desfiles.titulo")}</h1>
          <p className="mt-1.5 text-sm text-tinta-3">{t("desfiles.sub")}</p>
        </header>

        {/* Selector de día */}
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 lg:px-6" role="tablist" aria-label={t("desfiles.sub")}>
          {dias.map((d) => {
            const activo = d === dia;
            const p = partesDeFecha(d);
            return (
              <button
                key={d}
                role="tab"
                aria-selected={activo}
                aria-label={p.largo}
                onClick={() => setDiaElegido(d)}
                className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2.5 ${
                  activo ? "border-tinta bg-tinta text-papel" : "border-borde-2 bg-blanco text-tinta"
                }`}
              >
                <span className={`text-[10px] font-bold tracking-[1px] ${activo ? "text-papel/70" : "text-tinta-4"}`}>
                  {p.diaCorto}
                </span>
                <span className="fuente-display text-xl leading-tight">{p.diaNumero}</span>
              </button>
            );
          })}
        </div>

        <p className="mx-4 mt-3.5 rounded-xl bg-papel px-3 py-2 text-[11px] leading-snug font-semibold text-aviso-txt lg:mx-6">
          {t("desfiles.ejemplo")}
        </p>

        <div className="flex flex-col gap-3 px-4 py-3.5 pb-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-6">
          {programacion && filas.length === 0 && (
            <p className="text-[14px] text-tinta-3">{t("desfiles.vacio")}</p>
          )}
          {filas.map((f) => (
            <article key={f.id} className="rounded-2xl border border-borde bg-blanco px-4 py-3.5">
              <div className="flex items-center gap-3.5">
                <div className="w-[84px] shrink-0 text-center">
                  <div className="text-[15px] font-extrabold whitespace-nowrap text-tinta">{horaDelDia(f.hora)}</div>
                  {dia === programacion?.hoy && (
                    <div className="text-[11px] font-bold tracking-[1px] text-cabeza-txt uppercase">
                      {t("desfiles.hoy")}
                    </div>
                  )}
                </div>

                <div className="h-[38px] w-px shrink-0 bg-borde" aria-hidden />

                <div className="min-w-0 flex-1">
                  <h2 className="text-[17px] font-extrabold text-tinta">{f.titulo}</h2>
                  <p className="mt-0.5 truncate text-[13px] text-tinta-3">
                    {f.desfile && f.desfile.estado !== "programado" ? (
                      <span className={`font-bold ${f.desfile.estado === "en_curso" ? "text-ok" : "text-tinta-3"}`}>
                        {t(f.desfile.estado === "en_curso" ? "desfiles.enCurso" : "desfiles.finalizado")} ·{" "}
                      </span>
                    ) : null}
                    {f.lugar}
                  </p>
                </div>

                {f.desfile && (
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-lg bg-cabeza/12"
                    title={t("desfiles.seguir")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--color-cabeza)" aria-hidden>
                      <path d="M6 3l12 9-12 9z" />
                    </svg>
                  </span>
                )}
              </div>

              {f.desfile && f.desfile.estado !== "programado" && <Recorrido desfileId={f.desfile.id} />}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Por dónde pasó la cabeza y a qué hora. Se pide solo si alguien lo abre. */
function Recorrido({ desfileId }: { desfileId: string }) {
  const { t } = useIdioma();
  const [abierto, setAbierto] = useState(false);
  const [pasos, setPasos] = useState<PasoPorHito[] | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    fetch(`/api/desfiles/${encodeURIComponent(desfileId)}/recorrido`)
      .then((r) => (r.ok ? (r.json() as Promise<{ pasos: PasoPorHito[] }>) : null))
      .then((d) => {
        if (vivo && d) setPasos(d.pasos);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [abierto, desfileId]);

  return (
    <div className="mt-3 border-t border-borde pt-2.5">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="text-[13px] font-bold text-tinta underline underline-offset-2"
      >
        {abierto ? t("desfiles.ocultar") : t("desfiles.recorrido")}
      </button>
      {abierto && pasos && (
        <ol className="mt-2 space-y-1">
          {pasos.map((p) => (
            <li key={p.hitoId} className="flex justify-between gap-3 text-[13px]">
              <span className={p.ts ? "text-tinta" : "text-tinta-4"}>{p.nombre}</span>
              <span className={`shrink-0 font-bold ${p.ts ? "text-tinta-2" : "text-tinta-4"}`}>
                {p.ts ? horaCorta(p.ts) : t("desfiles.sinLlegar")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
