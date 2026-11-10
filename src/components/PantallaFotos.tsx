"use client";

import { useState } from "react";

/**
 * Muro de fotos.
 *
 * La pantalla está montada pero SIN CONTENIDO REAL: subir fotos es Fase 2 y
 * necesita autenticación, almacenamiento y moderación. Las baldosas de abajo son
 * el hueco del diseño, no fotos.
 *
 * Lo que sí se descartó a propósito son los @usuarios y los contadores de "me
 * gusta" que traía el diseño: inventar nombres de gente y cifras de likes en una
 * app que lleva el nombre del Carnaval es fabricar prueba social falsa. Se pintan
 * en cuanto haya fotos de verdad.
 */

const HUECOS = [
  { alto: 190, de: "#1487cc", a: "#0f6ba3", icono: "#bfe0f2" },
  { alto: 130, de: "#ff6a1f", a: "#ffc61a", icono: "#fff5e0" },
  { alto: 150, de: "#a06bff", a: "#6d3fd1", icono: "#e7dcff" },
  { alto: 170, de: "#0f8f5f", a: "#0b6e49", icono: "#d6f0e4" },
];

const ORDENES = [
  { id: "nuevo", etiqueta: "Lo más nuevo" },
  { id: "pichanga", etiqueta: "Lo más pichanga" },
] as const;

export function PantallaFotos() {
  const [orden, setOrden] = useState<(typeof ORDENES)[number]["id"]>("nuevo");

  return (
    <div className="flex-1 bg-papel-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-seguro px-5 pb-3 lg:px-6 lg:pt-8">
          <h1 className="fuente-display text-[34px] leading-none text-tinta">Fotos</h1>
          <p className="mt-1.5 text-sm text-tinta-3">
            Subí las tuyas y mirá las de todo el mundo
          </p>
        </header>

        <div className="flex gap-2 px-4 pt-1.5 pb-3 lg:px-6">
          {ORDENES.map((o) => {
            const activo = orden === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setOrden(o.id)}
                aria-pressed={activo}
                className={`flex h-8 items-center rounded-2xl px-3.5 text-[13px] font-bold ${
                  activo
                    ? "bg-tinta text-papel"
                    : "border border-borde-2 bg-blanco text-tinta-3"
                }`}
              >
                {o.etiqueta}
              </button>
            );
          })}
        </div>

        <p className="mx-4 mb-3.5 rounded-xl bg-papel lg:mx-6 px-3 py-2 text-[11px] leading-snug font-semibold text-aviso-txt">
          Así se va a ver. Todavía no hay fotos: subirlas llega en la fase 2, y ninguna se
          publica sin pasar por moderación.
        </p>

        <div className="px-4 pb-6 lg:px-6">
          <div className="[column-count:2] [column-gap:12px] lg:[column-count:4] lg:[column-gap:16px]">
            {HUECOS.map((h, i) => (
              <div
                key={i}
                className="mb-3 overflow-hidden rounded-2xl border border-[#e9e6dd] bg-blanco shadow-[0_6px_16px_-12px_rgba(0,0,0,0.4)] [break-inside:avoid]"
                aria-hidden
              >
                <div
                  className="grid place-items-center"
                  style={{
                    height: h.alto,
                    background: `linear-gradient(140deg, ${h.de}, ${h.a})`,
                  }}
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={h.icono}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                </div>
                <div className="px-3 py-2.5">
                  <div className="h-2.5 w-2/3 rounded-full bg-borde" />
                  <div className="mt-2 h-2.5 w-1/3 rounded-full bg-borde" />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled
            title="Disponible en la fase 2"
            className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-tinta text-base font-extrabold text-papel opacity-45 lg:mx-auto lg:max-w-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-cabeza)" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
            Subí tu foto
          </button>
          <p className="mt-2 text-center text-[12px] text-tinta-4">
            Se activa cuando esté lista la moderación.
          </p>
        </div>
      </div>
    </div>
  );
}
