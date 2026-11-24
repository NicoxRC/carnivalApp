"use client";

import { useEffect, useState } from "react";

import type { PuntoMapa } from "@/components/MapaDesfile";
import { nombreCategoria } from "@/lib/comercios";
import { distanciaCorta } from "@/lib/formato";
import { useIdioma } from "@/lib/i18n";
import { contarMetrica } from "@/lib/metricas";
import { metrosEnSenda, referenciaEnSenda } from "@/lib/senda";

interface Props {
  punto: PuntoMapa;
  /** Distancia en línea recta desde el usuario. null si no dio ubicación. */
  distanciaM: number | null;
  onCerrar: () => void;
  onLlevame: () => void;
}

/**
 * Ficha de un comercio, un servicio o una tarima.
 *
 * Es una ficha de sitio, no un anuncio: primero está lo que le sirve a quien la
 * abre —qué es, dónde queda, a qué hora abre, a cuánto está— y la oferta va
 * después. Los que contrataron espacio llevan el sello "Pauta" y, además, el
 * menú y el contacto: aparecer en el mapa no depende de pagar, pero cuando se
 * paga se dice.
 */
export function FichaPunto({ punto, distanciaM, onCerrar, onLlevame }: Props) {
  const { t } = useIdioma();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const proy = metrosEnSenda(punto.lat, punto.lng);
  const referencia = referenciaEnSenda(proy.metros, "estas", t).frase.replace(/^(estás|you're) /, "");
  const esPauta = Boolean(punto.plan);
  const esComercio = punto.grupo === "comercio";
  const menu = punto.menu ?? [];

  // Una vista de ficha por apertura. Solo comercios: es el número del anunciante.
  useEffect(() => {
    setMenuAbierto(false);
    if (esComercio) contarMetrica(punto.id, "ficha");
  }, [punto.id, esComercio]);

  const contar = (tipo: "mapa" | "menu" | "whatsapp" | "enlace") => {
    if (esComercio) contarMetrica(punto.id, tipo);
  };

  return (
    <div className="max-h-[70dvh] overflow-y-auto rounded-t-[26px] bg-blanco px-5 pt-4 pb-4 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.28)] lg:rounded-[26px] lg:border lg:border-borde-2 lg:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.34)]">
      <div className="mx-auto max-w-lg">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold tracking-[1px] text-tinta-3 uppercase">
              {punto.categoria === "presentacion" ? "Tarima" : nombreCategoria(punto.categoria)}
            </p>
            <h2 className="fuente-display mt-1 text-[22px] leading-[1.15] text-tinta">
              {punto.nombre}
            </h2>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            aria-label={t("ficha.cerrar")}
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
            <dt className="w-[74px] shrink-0 font-bold text-tinta-3">{t("ficha.donde")}</dt>
            <dd className="min-w-0 flex-1 text-tinta">
              {punto.direccion || referencia}
              {distanciaM !== null && (
                <span className="font-bold text-usuario">{t("ficha.a", { d: distanciaCorta(distanciaM) })}</span>
              )}
            </dd>
          </div>
          {punto.horario && (
            <div className="flex gap-2">
              <dt className="w-[74px] shrink-0 font-bold text-tinta-3">{t("ficha.horario")}</dt>
              <dd className="min-w-0 flex-1 text-tinta">{punto.horario}</dd>
            </div>
          )}
        </dl>

        {punto.promo && (
          <p className="mt-3 rounded-xl border border-dashed border-[#d8b96a] bg-papel px-3 py-2.5 text-[14px] font-bold text-tinta">
            {punto.promo}
          </p>
        )}

        {menu.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={menuAbierto}
              onClick={() => {
                if (!menuAbierto) contar("menu");
                setMenuAbierto((v) => !v);
              }}
              className="text-[14px] font-bold text-tinta underline underline-offset-2"
            >
              {menuAbierto ? t("ficha.ocultarMenu") : `${t("ficha.menu")} (${menu.length})`}
            </button>
            {menuAbierto && (
              <ul className="mt-2 divide-y divide-borde rounded-xl border border-borde-2">
                {menu.map((item, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[14px]">
                    <span className="min-w-0 text-tinta">{item.nombre}</span>
                    {item.precio && <span className="shrink-0 font-bold text-tinta-2">{item.precio}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              contar("mapa");
              onLlevame();
            }}
            className="flex h-11 min-w-[140px] flex-1 items-center justify-center gap-2 rounded-full bg-tinta text-sm font-bold text-papel active:opacity-90"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-cabeza)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
            {t("ficha.verMapa")}
          </button>

          {punto.whatsapp && (
            <a
              href={`https://wa.me/${punto.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => contar("whatsapp")}
              className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#128c4a] px-4 text-sm font-bold text-white active:opacity-90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 20l1.3-4A8 8 0 1 1 8.5 19z" />
              </svg>
              {t("ficha.whatsapp")}
            </a>
          )}

          {punto.enlace && (
            <a
              href={punto.enlace}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => contar("enlace")}
              className="flex h-11 items-center justify-center rounded-full border border-borde-2 px-4 text-sm font-bold text-tinta active:bg-papel-2"
            >
              {t("ficha.enlace")}
            </a>
          )}

          {/* Discreto, pero ahí. Si el usuario no puede saber qué es pauta y qué
              no, la confianza que se le vende al anunciante deja de existir. */}
          {esPauta && (
            <span className="shrink-0 rounded-full border border-borde-2 px-2.5 py-1 text-[10px] font-extrabold tracking-[1px] text-tinta-3">
              {t("ficha.pauta")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
