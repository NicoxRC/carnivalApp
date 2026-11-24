"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { obtenerDispositivo, olvidarDispositivo } from "@/lib/dispositivo";
import { useUbicacion } from "@/lib/hooks/useUbicacion";
import { useIdioma } from "@/lib/i18n";
import { reducirFoto } from "@/lib/imagen";
import { DESVIO_MAX_USUARIO_M, hitoMasCercano } from "@/lib/senda";
import type { Foto } from "@/lib/tipos";

/**
 * Muro de fotos del público.
 *
 * Cualquiera sube; nada se publica sin que alguien del equipo lo apruebe. El
 * contenido inapropiado bajo el nombre del Carnaval es un problema de
 * reputación, no un detalle de producto.
 *
 * No hay @usuarios ni contadores de "me gusta" (el diseño los traía): no hay
 * cuentas, y una cifra de likes inventada es prueba social falsa. Cada foto
 * dice lo único que se sabe de ella: por qué parte de la senda se tomó.
 */
type Subida = "nada" | "subiendo" | "enviada" | "error";

export function PantallaFotos() {
  const { t } = useIdioma();
  const { ubicacion } = useUbicacion();
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [subida, setSubida] = useState<Subida>("nada");
  const entrada = useRef<HTMLInputElement>(null);

  const leer = useCallback(() => {
    fetch("/api/fotos")
      .then((r) => (r.ok ? (r.json() as Promise<{ fotos: Foto[] }>) : null))
      .then((d) => d && setFotos(d.fotos))
      .catch(() => setFotos((f) => f ?? []));
  }, []);

  useEffect(leer, [leer]);

  const subir = async (archivo: File) => {
    setSubida("subiendo");
    try {
      const [jpeg, dispositivo] = await Promise.all([reducirFoto(archivo), obtenerDispositivo()]);
      if (!dispositivo) throw new Error("sin dispositivo");
      const form = new FormData();
      form.set("foto", jpeg, "foto.jpg");
      form.set("dispositivo", dispositivo);
      // Solo el tramo de la senda, y solo si está sobre ella: nunca lat/lng.
      if (ubicacion && ubicacion.proyeccion.desvioM <= DESVIO_MAX_USUARIO_M) {
        form.set("metros", String(Math.round(ubicacion.proyeccion.metros)));
      }
      const r = await fetch("/api/fotos", { method: "POST", body: form });
      if (r.status === 401) olvidarDispositivo();
      setSubida(r.ok ? "enviada" : "error");
    } catch {
      setSubida("error");
    }
  };

  return (
    <div className="flex-1 bg-papel-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-seguro px-5 pb-3 lg:px-6 lg:pt-8">
          <h1 className="fuente-display text-[34px] leading-none text-tinta">{t("fotos.titulo")}</h1>
          <p className="mt-1.5 text-sm text-tinta-3">{t("fotos.sub")}</p>
        </header>

        <div className="px-4 lg:px-6">
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              e.target.value = "";
              if (archivo) void subir(archivo);
            }}
          />
          <button
            type="button"
            disabled={subida === "subiendo"}
            onClick={() => entrada.current?.click()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-tinta text-[15px] font-extrabold text-papel active:opacity-90 disabled:opacity-60 lg:w-auto lg:px-8"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-cabeza)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
            {subida === "subiendo" ? t("fotos.subiendo") : t("fotos.subir")}
          </button>

          <p
            role="status"
            className={`mt-2.5 rounded-xl px-3 py-2 text-[12px] leading-snug font-semibold ${
              subida === "enviada"
                ? "bg-[#e3f3ea] text-ok"
                : subida === "error"
                  ? "bg-[#fbe9e7] text-alerta"
                  : "bg-papel text-aviso-txt"
            }`}
          >
            {subida === "enviada" ? t("fotos.enviada") : subida === "error" ? t("fotos.error") : t("fotos.reglas")}
          </p>
        </div>

        <div className="px-4 pt-4 pb-6 lg:px-6">
          {fotos !== null && fotos.length === 0 && (
            <p className="py-8 text-center text-[15px] text-tinta-3">{t("fotos.vacio")}</p>
          )}
          <div className="[column-count:2] [column-gap:12px] lg:[column-count:4] lg:[column-gap:16px]">
            {(fotos ?? []).map((f) => {
              const lugar = f.metros !== null ? hitoMasCercano(f.metros)?.nombre : null;
              return (
                <figure
                  key={f.id}
                  className="mb-3 overflow-hidden rounded-2xl border border-[#e9e6dd] bg-blanco shadow-[0_6px_16px_-12px_rgba(0,0,0,0.4)] [break-inside:avoid]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- ya viene reducida; el optimizador de Next no aporta y abre superficie */}
                  <img src={f.url} alt="" loading="lazy" className="block w-full" />
                  {lugar && (
                    <figcaption className="px-3 py-2 text-[12px] font-semibold text-tinta-3">
                      {t("fotos.en", { lugar })}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
