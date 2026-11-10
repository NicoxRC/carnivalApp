"use client";

import type { PuntoMapa } from "@/components/MapaDesfile";
import { distanciaCorta } from "@/lib/formato";
import { metrosEnSenda, referenciaEnSenda } from "@/lib/senda";

const ETIQUETA_CATEGORIA: Record<string, string> = {
  presentacion: "Tarima",
  restaurante: "Restaurante",
  tasca: "Tasca",
  cafe: "Café",
  heladeria: "Heladería",
  panaderia: "Panadería",
  tienda: "Tienda",
  bar: "Bar",
  farmacia: "Droguería",
};

interface Props {
  punto: PuntoMapa;
  /** Distancia en línea recta desde el usuario. null si no dio ubicación. */
  distanciaM: number | null;
  onCerrar: () => void;
  onLlevame: () => void;
}

/**
 * Ficha de un comercio o una tarima.
 *
 * Es una ficha de sitio, no un anuncio: primero está lo que le sirve a quien la
 * abre —qué es, dónde queda, a qué hora abre, a cuánto está— y la oferta va
 * después. Los que contrataron espacio llevan el sello "Pauta": aparecer en el
 * mapa no depende de pagar, pero cuando se paga se dice.
 */
export function FichaPunto({ punto, distanciaM, onCerrar, onLlevame }: Props) {
  const proy = metrosEnSenda(punto.lat, punto.lng);
  const referencia = referenciaEnSenda(proy.metros, "estas").frase.replace(/^estás /, "");
  const esPauta = Boolean(punto.plan);

  return (
    <div className="rounded-t-[26px] bg-blanco px-5 pt-4 pb-4 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.28)] lg:rounded-[26px] lg:border lg:border-borde-2 lg:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.34)]">
      <div className="mx-auto max-w-lg">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold tracking-[1px] text-tinta-3 uppercase">
              {ETIQUETA_CATEGORIA[punto.categoria] ?? "Sitio"}
            </p>
            <h2 className="fuente-display mt-1 text-[22px] leading-[1.15] text-tinta">
              {punto.nombre}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-papel-2 text-tinta-2 active:bg-borde"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {punto.descripcion && (
          <p className="mt-2.5 text-[15px] leading-snug text-tinta-2">{punto.descripcion}</p>
        )}

        <dl className="mt-3.5 space-y-1.5 text-[13px]">
          <div className="flex gap-2">
            <dt className="w-[74px] shrink-0 font-bold text-tinta-3">Dónde</dt>
            <dd className="min-w-0 flex-1 text-tinta">
              {punto.direccion ?? referencia}
              {distanciaM !== null && (
                <span className="font-bold text-usuario"> · a {distanciaCorta(distanciaM)}</span>
              )}
            </dd>
          </div>
          {punto.horario && (
            <div className="flex gap-2">
              <dt className="w-[74px] shrink-0 font-bold text-tinta-3">Horario</dt>
              <dd className="min-w-0 flex-1 text-tinta">{punto.horario}</dd>
            </div>
          )}
        </dl>

        {punto.promo && (
          <p className="mt-3 rounded-xl border border-dashed border-[#d8b96a] bg-papel px-3 py-2.5 text-[14px] font-bold text-tinta">
            {punto.promo}
          </p>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          <button
            type="button"
            onClick={onLlevame}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-tinta text-sm font-bold text-papel active:opacity-90"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-cabeza)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
            Ver en el mapa
          </button>

          {/* Discreto, pero ahí. Si el usuario no puede saber qué es pauta y qué
              no, la confianza que se le vende al anunciante deja de existir. */}
          {esPauta && (
            <span className="shrink-0 rounded-full border border-borde-2 px-2.5 py-1 text-[10px] font-extrabold tracking-[1px] text-tinta-3">
              PAUTA
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
