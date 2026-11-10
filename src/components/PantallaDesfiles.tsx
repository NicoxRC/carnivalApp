"use client";

import { useState } from "react";

import datos from "@/data/desfiles-ejemplo.json";

interface EventoDia {
  id: string;
  hora: string;
  titulo: string;
  lugar: string;
  esDesfile: boolean;
}

interface Dia {
  id: string;
  diaCorto: string;
  diaNumero: string;
  fecha: string;
  eventos: EventoDia[];
}

const DIAS = datos.dias as Dia[];

/** El día de hoy, si cae dentro del Carnaval; si no, el primero. */
function diaPorDefecto(): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return DIAS.find((d) => d.fecha === hoy)?.id ?? DIAS[0].id;
}

export function PantallaDesfiles() {
  const [diaId, setDiaId] = useState(diaPorDefecto);
  const dia = DIAS.find((d) => d.id === diaId) ?? DIAS[0];
  const hoyISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex-1 bg-papel-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-seguro px-5 pb-3.5 lg:px-6 lg:pt-8">
          <h1 className="fuente-display text-[34px] leading-none text-tinta">Desfiles</h1>
          <p className="mt-1.5 text-sm text-tinta-3">{datos.rango} · toda la programación</p>
        </header>

        {/* Selector de día */}
        <div
          className="flex gap-2 overflow-x-auto px-4 pb-1 lg:px-6"
          role="tablist"
          aria-label="Días de carnaval"
        >
          {DIAS.map((d) => {
            const activo = d.id === dia.id;
            return (
              <button
                key={d.id}
                role="tab"
                aria-selected={activo}
                onClick={() => setDiaId(d.id)}
                className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2.5 ${
                  activo
                    ? "border-tinta bg-tinta text-papel"
                    : "border-borde-2 bg-blanco text-tinta"
                }`}
              >
                <span
                  className={`text-[10px] font-bold tracking-[1px] ${
                    activo ? "text-papel/70" : "text-tinta-4"
                  }`}
                >
                  {d.diaCorto}
                </span>
                <span className="fuente-display text-xl leading-tight">{d.diaNumero}</span>
              </button>
            );
          })}
        </div>

        <p className="mx-4 mt-3.5 rounded-xl bg-papel px-3 py-2 text-[11px] leading-snug font-semibold text-aviso-txt lg:mx-6">
          Programación de ejemplo. Ni fechas ni horas están confirmadas con Corpocarnaval.
        </p>

        <div className="flex flex-col gap-3 px-4 py-3.5 pb-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-6">
          {dia.eventos.map((e) => (
            <article
              key={e.id}
              className="flex items-center gap-3.5 rounded-2xl border border-borde bg-blanco px-4 py-3.5"
            >
              <div className="w-[52px] shrink-0 text-center">
                <div className="text-lg font-extrabold text-tinta">{e.hora}</div>
                {dia.fecha === hoyISO && (
                  <div className="text-[11px] font-bold tracking-[1px] text-cabeza-txt uppercase">
                    Hoy
                  </div>
                )}
              </div>

              <div className="h-[38px] w-px shrink-0 bg-borde" aria-hidden />

              <div className="min-w-0 flex-1">
                <h2 className="text-[17px] font-extrabold text-tinta">{e.titulo}</h2>
                <p className="mt-0.5 truncate text-[13px] text-tinta-3">{e.lugar}</p>
              </div>

              {e.esDesfile && (
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-cabeza/12"
                  title="Se puede seguir en el mapa"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--color-cabeza)" aria-hidden>
                    <path d="M6 3l12 9-12 9z" />
                  </svg>
                </span>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
