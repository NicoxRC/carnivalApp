"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";

import { Avisos } from "@/components/Avisos";
import { calcularEta } from "@/lib/eta";
import { minutosDeHora, minutosDelDiaEnPasto, partesDeFecha } from "@/lib/fecha";
import { distanciaCorta, horaDelDia } from "@/lib/formato";
import { distanciaHaversine } from "@/lib/geo";
import { useComercios } from "@/lib/hooks/useComercios";
import { useEstadoDesfile, useReloj } from "@/lib/hooks/useEstadoDesfile";
import { useProgramacion } from "@/lib/hooks/useProgramacion";
import { useUbicacion } from "@/lib/hooks/useUbicacion";
import { useIdioma } from "@/lib/i18n";
import { contarMetrica } from "@/lib/metricas";
import { DESVIO_MAX_USUARIO_M } from "@/lib/senda";

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
  const { t } = useIdioma();
  const { estado, desfaseMs } = useEstadoDesfile();
  const { ubicacion, pedir, permiso } = useUbicacion();
  const programacion = useProgramacion();
  const comercios = useComercios(true);
  const relojLocal = useReloj(30_000);
  const ahora = relojLocal + desfaseMs;

  // Hora de Pasto, no la del celular: un turista con otra zona horaria vería
  // "ya pasó" en eventos que todavía no empiezan.
  const minutosAhora = minutosDelDiaEnPasto(ahora);

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

  /**
   * Los eventos de HOY. Si hoy no hay nada (falta para el Carnaval, o es un día
   * sin programación) se muestra el próximo día que tenga, diciendo cuál es:
   * mejor "lo próximo: 2 de enero" que una pantalla vacía.
   */
  const { dia, esHoy, eventos } = useMemo(() => {
    if (!programacion) return { dia: null, esHoy: true, eventos: [] };
    const fechas = [...new Set(programacion.eventos.map((e) => e.fecha))].sort();
    const elegido = fechas.includes(programacion.hoy)
      ? programacion.hoy
      : (fechas.find((f) => f > programacion.hoy) ?? null);
    const hoy = elegido === programacion.hoy;
    const lista = programacion.eventos
      .filter((e) => e.fecha === elegido)
      .sort((a, b) => minutosDeHora(a.horaInicio) - minutosDeHora(b.horaInicio))
      .map((e) => {
        const inicio = minutosDeHora(e.horaInicio);
        const fin = e.horaFin ? minutosDeHora(e.horaFin) : inicio + 60;
        return {
          ...e,
          distanciaM:
            ubicacion && e.lat !== null && e.lng !== null
              ? distanciaHaversine(ubicacion.lat, ubicacion.lng, e.lat, e.lng)
              : null,
          enCurso: hoy && minutosAhora >= inicio && minutosAhora < fin,
          yaPaso: hoy && minutosAhora >= fin,
        };
      });
    return { dia: elegido, esHoy: hoy, eventos: lista };
  }, [programacion, ubicacion, minutosAhora]);

  // Un comercio destacado, marcado como pauta. Rota con la hora para repartir
  // la vitrina entre todos los que pagaron el plan.
  const destacado = useMemo(() => {
    const lista = comercios.filter((c) => c.plan === "destacado");
    return lista.length > 0 ? lista[Math.floor(minutosAhora / 30) % lista.length] : null;
  }, [comercios, minutosAhora]);
  const idDestacado = destacado?.id ?? null;
  useEffect(() => {
    if (idDestacado) contarMetrica(idDestacado, "oferta");
  }, [idDestacado]);

  const enVivo = estado?.estado === "en_curso" && Boolean(estado.posiciones.cabeza);

  return (
    <div className="flex-1 bg-papel-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-seguro flex items-center justify-between px-5 pb-3.5 lg:px-6 lg:pt-8">
          <div>
            <h1 className="fuente-display text-[34px] leading-none text-tinta">{t("hoy.titulo")}</h1>
            <p className="mt-1.5 text-sm text-tinta-3">
              {estado?.nombre}
              {programacion ? ` · ${partesDeFecha(programacion.hoy).largo}` : ""}
            </p>
          </div>
          <IconoSol />
        </header>

        <div className="flex flex-col gap-3.5 px-4 pb-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:px-6">
          {estado && estado.avisos.length > 0 && (
            <div className="lg:col-span-2">
              <Avisos avisos={estado.avisos} />
            </div>
          )}

          {/* --- El desfile, en vivo --- */}
          {enVivo && eta ? (
            <article className="overflow-hidden rounded-[20px] border-2 border-cabeza bg-blanco shadow-[0_10px_26px_-12px_rgba(234,90,18,0.45)] lg:col-span-2">
              <div className="flex items-center gap-2 bg-cabeza px-4 py-2">
                <span className="latido size-2 rounded-full bg-white" aria-hidden />
                <span className="text-[13px] font-extrabold tracking-[1.5px] text-white">
                  {t("hoy.ahorita")}
                </span>
              </div>
              <div className="p-4">
                <h2 className="fuente-display text-2xl leading-[1.05] text-tinta">
                  {estado?.nombre}
                </h2>
                {eta.tipo === "llegando" || eta.tipo === "detenido" ? (
                  <>
                    <p className="mt-3.5 flex items-baseline gap-2">
                      <span className="text-[30px] font-extrabold tracking-[-0.5px] text-cabeza-txt">
                        {t("hoy.a", { d: distanciaCorta(eta.distanciaM) })}
                      </span>
                      <span className="text-[15px] text-tinta-2">
                        {eta.distanciaM < 900 ? t("hoy.yaCasi") : t("hoy.deDonde")}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-tinta-3">
                      {eta.tipo === "detenido"
                        ? t("hoy.parado", { n: eta.detenidoHaceMin })
                        : t("hoy.teCae", { a: eta.minMin, b: eta.maxMin })}
                    </p>
                  </>
                ) : (
                  <p className="mt-3.5 text-[15px] text-tinta-2">
                    {eta.tipo === "aqui"
                      ? t("hoy.pasando")
                      : eta.tipo === "ya_paso"
                        ? t("hoy.yaPaso")
                        : eta.tipo === "sin_senal"
                          ? t("hoy.sinSenal", { n: eta.haceMin })
                          : t("hoy.decinos")}
                  </p>
                )}

                <Link
                  href="/"
                  className="mt-3.5 flex h-[46px] items-center justify-center gap-2 rounded-xl bg-tinta text-[15px] font-extrabold text-papel active:opacity-90"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-cabeza)" aria-hidden>
                    <path d="M6 3l12 9-12 9z" />
                  </svg>
                  {t("hoy.seguilo")}
                </Link>
              </div>
            </article>
          ) : (
            <article className="rounded-[20px] border border-borde-2 bg-blanco p-4 lg:col-span-2">
              <h2 className="fuente-display text-2xl leading-[1.05] text-tinta">
                {estado?.nombre ?? "Desfile"}
              </h2>
              <p className="mt-1.5 text-sm text-tinta-3">
                {estado?.estado === "finalizado"
                  ? t("desfiles.finalizado")
                  : estado && programacion && estado.fecha !== programacion.hoy
                    ? t("hoy.sale", { fecha: partesDeFecha(estado.fecha).largo, hora: horaDelDia(estado.horaInicio) })
                    : t("hoy.noArranca")}
              </p>
              <Link
                href="/"
                className="mt-3.5 flex h-[46px] items-center justify-center gap-2 rounded-xl bg-tinta text-[15px] font-extrabold text-papel active:opacity-90"
              >
                {t("hoy.verMapa")}
              </Link>
            </article>
          )}

          {!ubicacion && permiso !== "denegado" && (
            <button
              type="button"
              onClick={pedir}
              className="rounded-2xl border border-borde-2 bg-blanco px-4 py-3.5 text-[15px] font-bold text-tinta active:bg-papel-2 lg:col-span-2"
            >
              {t("hoy.distancias")}
            </button>
          )}

          <p className="rounded-xl bg-papel px-3 py-2 text-[11px] leading-snug font-semibold text-aviso-txt lg:col-span-2">
            {t("hoy.ejemplo")}
          </p>

          {/* --- Comercio destacado: vitrina pagada, y se dice --- */}
          {destacado && (
            <Link
              href="/"
              className="rounded-2xl border border-dashed border-[#d8b96a] bg-papel px-4 py-3.5 lg:col-span-2"
            >
              <span className="mb-2 inline-block rounded-[5px] bg-[#f0e2b8] px-[7px] py-[3px] text-[10px] font-extrabold tracking-[1.4px] text-[#8a7020]">
                {t("ficha.pauta")} · {t("hoy.cerca")}
              </span>
              <h3 className="text-base font-extrabold text-tinta">{destacado.nombre}</h3>
              <p className="mt-0.5 text-[13px] text-tinta-3">
                {destacado.promo ?? destacado.descripcion}
                {ubicacion &&
                  t("ficha.a", {
                    d: distanciaCorta(distanciaHaversine(ubicacion.lat, ubicacion.lng, destacado.lat, destacado.lng)),
                  })}
              </p>
            </Link>
          )}

          {programacion && !esHoy && dia && (
            <p className="text-[13px] font-bold text-tinta-2 lg:col-span-2">
              {t("hoy.proximo", { fecha: partesDeFecha(dia).largo })}
            </p>
          )}
          {programacion && eventos.length === 0 && (
            <p className="text-[14px] text-tinta-3 lg:col-span-2">{t("hoy.nada")}</p>
          )}

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
                  {t("ficha.pauta")}
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
                        <span className="shrink-0">{t("ficha.a", { d: distanciaCorta(e.distanciaM) })}</span>
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
                  {esHoy && (
                  <div
                    className={`text-[11px] font-bold tracking-[1px] uppercase ${
                      e.enCurso ? "text-cabeza-txt" : e.yaPaso ? "text-tinta-4" : "text-cola"
                    }`}
                  >
                    {e.enCurso ? t("hoy.enCurso") : e.yaPaso ? t("hoy.pasado") : t("hoy.viene")}
                  </div>
                  )}
                </div>

                <div className="h-[38px] w-px shrink-0 bg-borde" aria-hidden />

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[17px] font-extrabold text-tinta">{e.titulo}</h3>
                  {/* El lugar se recorta si hace falta; la distancia no: es el dato
                      por el que se mira esta lista. */}
                  <p className="mt-0.5 flex gap-1 text-[13px] text-tinta-3">
                    <span className="truncate">{e.lugarNombre}</span>
                    {e.distanciaM !== null && (
                      <span className="shrink-0">{t("ficha.a", { d: distanciaCorta(e.distanciaM) })}</span>
                    )}
                  </p>
                  {e.yaPaso && e.horaFin && (
                    <p className="mt-0.5 text-[12px] text-tinta-4">
                      {t("hoy.seAcabo", { hora: horaDelDia(e.horaFin) })}
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
