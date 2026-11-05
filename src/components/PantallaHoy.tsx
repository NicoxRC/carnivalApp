"use client";

import Link from "next/link";
import { useMemo } from "react";

import datos from "@/data/eventos-ejemplo.json";
import { DESFILE_DEMO } from "@/lib/datos";
import { calcularEta } from "@/lib/eta";
import { distanciaCorta, horaDelDia } from "@/lib/formato";
import { distanciaHaversine } from "@/lib/geo";
import { DESVIO_MAX_USUARIO_M } from "@/lib/senda";
import { useEstadoDesfile, useReloj } from "@/lib/hooks/useEstadoDesfile";
import { useUbicacion } from "@/lib/hooks/useUbicacion";

interface Evento {
  id: string;
  horaInicio: string;
  horaFin: string | null;
  titulo: string;
  descripcion: string;
  categoria: string;
  lugarNombre: string;
  lat: number;
  lng: number;
  patrocinado: boolean;
}

function minutosDelDia(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

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
  const { estado, desfaseMs } = useEstadoDesfile(DESFILE_DEMO);
  const { ubicacion, pedir, permiso } = useUbicacion();
  const relojLocal = useReloj(30_000);
  const ahora = relojLocal + desfaseMs;

  const minutosAhora = useMemo(() => {
    const d = new Date(ahora);
    return d.getHours() * 60 + d.getMinutes();
  }, [ahora]);

  // El desfile es la tarjeta destacada: es lo único de esta pantalla que va en vivo.
  const eta = useMemo(() => {
    if (!estado) return null;
    return calcularEta({
      estado,
      metrosUsuario: ubicacion?.proyeccion.metros ?? null,
      desvioUsuarioM: ubicacion?.proyeccion.desvioM ?? null,
      desvioMaxM: DESVIO_MAX_USUARIO_M,
      ahora,
    });
  }, [estado, ubicacion, ahora]);

  const eventos = useMemo(() => {
    return (datos.eventos as Evento[])
      .slice()
      .sort((a, b) => minutosDelDia(a.horaInicio) - minutosDelDia(b.horaInicio))
      .map((e) => {
        const inicio = minutosDelDia(e.horaInicio);
        const fin = e.horaFin ? minutosDelDia(e.horaFin) : inicio + 60;
        return {
          ...e,
          distanciaM: ubicacion
            ? distanciaHaversine(ubicacion.lat, ubicacion.lng, e.lat, e.lng)
            : null,
          enCurso: minutosAhora >= inicio && minutosAhora < fin,
          yaPaso: minutosAhora >= fin,
        };
      });
  }, [ubicacion, minutosAhora]);

  const enVivo = estado?.estado === "en_curso" && Boolean(estado.posiciones.cabeza);

  return (
    <div className="flex-1 bg-papel-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-seguro flex items-center justify-between px-5 pb-3.5 lg:px-6 lg:pt-8">
          <div>
            <h1 className="fuente-display text-[34px] leading-none text-tinta">Hoy</h1>
            <p className="mt-1.5 text-sm text-tinta-3">{datos.nombreDia}</p>
          </div>
          <IconoSol />
        </header>

        <div className="flex flex-col gap-3.5 px-4 pb-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-6">
          {/* --- El desfile, en vivo --- */}
          {enVivo && eta ? (
            <article className="overflow-hidden rounded-[20px] border-2 border-cabeza bg-blanco shadow-[0_10px_26px_-12px_rgba(234,90,18,0.45)] lg:col-span-2">
              <div className="flex items-center gap-2 bg-cabeza px-4 py-2">
                <span className="latido size-2 rounded-full bg-white" aria-hidden />
                <span className="text-[13px] font-extrabold tracking-[1.5px] text-white">
                  AHORITA · EN VIVO
                </span>
              </div>
              <div className="p-4">
                <h2 className="fuente-display text-2xl leading-[1.05] text-tinta">
                  {estado?.nombre}
                </h2>
                <p className="mt-1.5 text-sm text-tinta-3">
                  {datos.eventos[0]?.lugarNombre} → {datos.eventos.at(-1)?.lugarNombre}
                </p>

                {eta.tipo === "llegando" || eta.tipo === "detenido" ? (
                  <>
                    <p className="mt-3.5 flex items-baseline gap-2">
                      <span className="text-[30px] font-extrabold tracking-[-0.5px] text-cabeza-txt">
                        A {distanciaCorta(eta.distanciaM)}
                      </span>
                      <span className="text-[15px] text-tinta-2">
                        {eta.distanciaM < 900 ? "de vos, ¡ya casi!" : "de donde estás"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-tinta-3">
                      {eta.tipo === "detenido"
                        ? `Parado hace ${eta.detenidoHaceMin} min`
                        : `Te cae en ${eta.minMin}–${eta.maxMin} min`}
                    </p>
                  </>
                ) : (
                  <p className="mt-3.5 text-[15px] text-tinta-2">
                    {eta.tipo === "aqui"
                      ? "¡Te está pasando por delante!"
                      : eta.tipo === "ya_paso"
                        ? "Ya pasó por donde estás"
                        : "Decinos dónde estás y te calculo cuánto le falta."}
                  </p>
                )}

                <Link
                  href="/"
                  className="mt-3.5 flex h-[46px] items-center justify-center gap-2 rounded-xl bg-tinta text-[15px] font-extrabold text-papel active:opacity-90"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-cabeza)" aria-hidden>
                    <path d="M6 3l12 9-12 9z" />
                  </svg>
                  Seguilo en el mapa
                </Link>
              </div>
            </article>
          ) : (
            <article className="rounded-[20px] border border-borde-2 bg-blanco p-4 lg:col-span-2">
              <h2 className="fuente-display text-2xl leading-[1.05] text-tinta">
                {estado?.nombre ?? "Desfile"}
              </h2>
              <p className="mt-1.5 text-sm text-tinta-3">
                Todavía no arranca. Cuando salga, acá te digo cuánto le falta.
              </p>
              <Link
                href="/"
                className="mt-3.5 flex h-[46px] items-center justify-center gap-2 rounded-xl bg-tinta text-[15px] font-extrabold text-papel active:opacity-90"
              >
                Ver el mapa
              </Link>
            </article>
          )}

          {!ubicacion && permiso !== "denegado" && (
            <button
              type="button"
              onClick={pedir}
              className="rounded-2xl border border-borde-2 bg-blanco px-4 py-3.5 text-[15px] font-bold text-tinta active:bg-papel-2 lg:col-span-2"
            >
              Mostrame a qué distancia me queda cada cosa
            </button>
          )}

          <p className="rounded-xl bg-papel px-3 py-2 text-[11px] leading-snug font-semibold text-aviso-txt lg:col-span-2">
            Programación de ejemplo, no oficial. Se reemplaza por la de Corpocarnaval.
          </p>

          {/* --- Resto del día --- */}
          {eventos.map((e) =>
            e.patrocinado ? (
              <article
                key={e.id}
                className="rounded-2xl border border-dashed border-[#d8b96a] bg-papel px-4 py-3.5"
              >
                {/* Lo patrocinado se marca. Disfrazarlo rompe la confianza que es
                    justamente lo que se le vende al anunciante. */}
                <span className="mb-3 inline-block rounded-[5px] bg-[#f0e2b8] px-[7px] py-[3px] text-[10px] font-extrabold tracking-[1.4px] text-[#8a7020]">
                  PAUTA
                </span>
                <div className="flex items-center gap-3.5">
                  <span
                    className="fuente-display grid size-11 shrink-0 place-items-center rounded-xl bg-marca text-xl text-papel"
                    aria-hidden
                  >
                    {e.titulo.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-extrabold text-tinta">{e.titulo}</h3>
                    <p className="mt-0.5 flex gap-1 text-[13px] text-tinta-3">
                      <span className="truncate">{e.lugarNombre}</span>
                      {e.distanciaM !== null && (
                        <span className="shrink-0">· a {distanciaCorta(e.distanciaM)}</span>
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
                  <div className="text-lg font-extrabold text-tinta">{e.horaInicio}</div>
                  <div
                    className={`text-[11px] font-bold tracking-[1px] uppercase ${
                      e.enCurso ? "text-cabeza-txt" : e.yaPaso ? "text-tinta-4" : "text-cola"
                    }`}
                  >
                    {e.enCurso ? "Ahorita" : e.yaPaso ? "Ya pasó" : "Ahí viene"}
                  </div>
                </div>

                <div className="h-[38px] w-px shrink-0 bg-borde" aria-hidden />

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[17px] font-extrabold text-tinta">{e.titulo}</h3>
                  {/* El lugar se recorta si hace falta; la distancia no: es el dato
                      por el que se mira esta lista. */}
                  <p className="mt-0.5 flex gap-1 text-[13px] text-tinta-3">
                    <span className="truncate">{e.lugarNombre}</span>
                    {e.distanciaM !== null && (
                      <span className="shrink-0">· a {distanciaCorta(e.distanciaM)}</span>
                    )}
                  </p>
                  {e.yaPaso && e.horaFin && (
                    <p className="mt-0.5 text-[12px] text-tinta-4">
                      se acabó {horaDelDia(e.horaFin)}
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
