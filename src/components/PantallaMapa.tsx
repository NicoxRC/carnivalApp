"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Avisos } from "@/components/Avisos";
import { BarraEta } from "@/components/BarraEta";
import { Inicio } from "@/components/Inicio";
import { PanelSimulacion } from "@/components/PanelSimulacion";
import type { Encuadre, PuntoMapa } from "@/components/MapaDesfile";
import { FichaPunto } from "@/components/FichaPunto";
import { esServicio } from "@/lib/comercios";
import { COLOR_NIVEL, BIN_M, MIN_USUARIOS_GLOBAL } from "@/lib/densidad";
import { MODO_DATOS } from "@/lib/datos/modo";
import { calcularEta } from "@/lib/eta";
import { distanciaHaversine } from "@/lib/geo";
import { useComercios } from "@/lib/hooks/useComercios";
import { useEstadoDesfile, useReloj } from "@/lib/hooks/useEstadoDesfile";
import { useDensidad } from "@/lib/hooks/useDensidad";
import { useProgramacion } from "@/lib/hooks/useProgramacion";
import { useUbicacion } from "@/lib/hooks/useUbicacion";
import { useIdioma } from "@/lib/i18n";
import { contarMetrica } from "@/lib/metricas";
import { DESVIO_MAX_USUARIO_M, hitoMasCercano, metrosEnSenda, puntoEnMetro, referenciaEnSenda, SENDA } from "@/lib/senda";
import type { Comercio, EstadoDesfile } from "@/lib/tipos";

// MapLibre toca `window` al importarse: fuera del render del servidor.
const MapaDesfile = dynamic(() => import("@/components/MapaDesfile"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-papel-2" />,
});

/**
 * Las capas del mapa.
 *
 * "Comercios" reúne restaurantes, tascas, cafés, tiendas y droguerías: para
 * alguien parado en la senda todos responden la misma pregunta —dónde como,
 * dónde compro— y separarlos en cinco filtros solo añade trabajo. El icono
 * distingue de qué tipo es cada uno.
 *
 * "Servicios" (baños, agua, primeros auxilios) solo aparece si el equipo cargó
 * alguno desde el panel: un baño inventado en un mapa que alguien usa para
 * buscar un baño es peor que no ofrecer el filtro.
 */
const CAPAS = [
  { id: "desfile", clave: "capa.desfile", color: "#ff6a1f" },
  { id: "comercio", clave: "capa.comercios", color: "#2fa898" },
  { id: "presentacion", clave: "capa.tarimas", color: "#a06bff" },
  { id: "servicio", clave: "capa.servicios", color: "#1487cc" },
] as const;

type CapaId = (typeof CAPAS)[number]["id"];

const CLAVE_INICIO = "sed:inicio-visto";
/** Una oferta "cerca" es una a la que se llega caminando sin perder el puesto. */
const RADIO_OFERTA_M = 300;

/**
 * ¿Se muestra ahora la oferta de este comercio? Con "antes"/"después" depende
 * de si el desfile ya pasó frente a él: «2x1 en hervidos cuando pase el desfile».
 */
function promoVigente(c: Comercio, estado: EstadoDesfile | null): boolean {
  if (!c.plan || !c.promo) return false;
  if (c.promoMomento === "siempre") return true;
  const frente = metrosEnSenda(c.lat, c.lng).metros;
  const cabeza = estado?.posiciones.cabeza?.metros ?? null;
  const cola = estado?.posiciones.cola?.metros ?? cabeza;
  if (c.promoMomento === "antes") return cabeza === null || cabeza < frente;
  return cola !== null && cola > frente;
}

export function PantallaMapa() {
  const { t } = useIdioma();
  const { estado, conexion, desfaseMs } = useEstadoDesfile();
  const { ubicacion, permiso, mensajeError, pedir, fijarManual, limpiarManual } = useUbicacion();
  // Cada 5 s y no cada segundo: esta pantalla entera se redibuja con el reloj,
  // y un "hace 23 s" que salta de 5 en 5 se lee igual gastando menos batería.
  const relojLocal = useReloj(5000);
  const [marcando, setMarcando] = useState(false);
  const [capas, setCapas] = useState<Set<CapaId>>(new Set<CapaId>(["desfile"]));
  const [encuadre, setEncuadre] = useState<Encuadre | null>(null);
  // null = todavía no sabemos si ya vio el inicio (localStorage solo existe tras montar).
  const [inicioVisto, setInicioVisto] = useState<boolean | null>(null);
  const [verGentio, setVerGentio] = useState(false);
  const [verSugerencias, setVerSugerencias] = useState(false);
  const [puntoSel, setPuntoSel] = useState<PuntoMapa | null>(null);
  const [encuentroM, setEncuentroM] = useState<number | null>(null);
  const [ofertaCerrada, setOfertaCerrada] = useState<string | null>(null);
  const comercios = useComercios(true);
  const programacion = useProgramacion();

  useEffect(() => {
    try {
      setInicioVisto(localStorage.getItem(CLAVE_INICIO) === "1");
    } catch {
      // localStorage bloqueado: se salta el inicio en vez de repetirlo cada vez.
      setInicioVisto(true);
    }
    // «Estoy acá»: alguien compartió su punto de la senda.
    const m = Number(new URLSearchParams(window.location.search).get("encuentro"));
    if (Number.isFinite(m) && m > 0 && m <= SENDA.longitudMetros) setEncuentroM(m);
  }, []);

  const marcarInicioVisto = useCallback(() => {
    try {
      localStorage.setItem(CLAVE_INICIO, "1");
    } catch {
      // sin persistencia: vale para esta sesión
    }
    setInicioVisto(true);
  }, []);

  // El reloj del celular puede estar corrido. Los "hace X min" se calculan
  // contra el reloj del servidor para que no mientan.
  const ahora = relojLocal + desfaseMs;
  const metrosUsuario = ubicacion?.proyeccion.metros ?? null;

  const eta = useMemo(() => {
    if (!estado) return { tipo: "sin_datos", motivo: "sin_reporte" } as const;
    return calcularEta({
      estado,
      metrosUsuario,
      desvioUsuarioM: ubicacion?.proyeccion.desvioM ?? null,
      desvioMaxM: DESVIO_MAX_USUARIO_M,
      ahora,
    });
  }, [estado, metrosUsuario, ubicacion, ahora]);

  const hayServicios = comercios.some((c) => esServicio(c.categoria));

  const puntos = useMemo<PuntoMapa[]>(() => {
    const lista: PuntoMapa[] = [];

    if (capas.has("presentacion") && programacion) {
      // Las tarimas del día del desfile que se está siguiendo.
      const dia = estado?.fecha ?? programacion.hoy;
      for (const e of programacion.eventos) {
        if (e.categoria !== "presentacion" || e.fecha !== dia || e.lat === null || e.lng === null) continue;
        lista.push({
          id: e.id,
          nombre: e.titulo,
          lat: e.lat,
          lng: e.lng,
          categoria: e.categoria,
          grupo: "tarima",
          descripcion: e.descripcion,
          direccion: e.lugarNombre,
          horario: e.horaFin ? `${e.horaInicio} – ${e.horaFin}` : e.horaInicio,
        });
      }
    }

    for (const c of comercios) {
      const servicio = esServicio(c.categoria);
      if (!capas.has(servicio ? "servicio" : "comercio")) continue;
      lista.push({
        id: c.id,
        nombre: c.nombre,
        lat: c.lat,
        lng: c.lng,
        categoria: c.categoria,
        grupo: servicio ? "servicio" : "comercio",
        descripcion: c.descripcion,
        direccion: c.direccion,
        horario: c.horario,
        promo: promoVigente(c, estado) ? c.promo : null,
        plan: c.plan,
        menu: c.menu,
        whatsapp: c.whatsapp,
        enlace: c.enlace,
      });
    }

    return lista;
  }, [capas, comercios, programacion, estado]);

  // Si se apaga la capa del punto abierto, la ficha se cierra con ella.
  useEffect(() => {
    if (puntoSel && !puntos.some((p) => p.id === puntoSel.id)) setPuntoSel(null);
  }, [puntos, puntoSel]);

  const distanciaAlPunto =
    puntoSel && ubicacion
      ? distanciaHaversine(ubicacion.lat, ubicacion.lng, puntoSel.lat, puntoSel.lng)
      : null;

  const alternarCapa = (id: CapaId) =>
    setCapas((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const { densidad, compartir, decidirCompartir } = useDensidad(verGentio, metrosUsuario);

  /**
   * «¿Dónde me hago?»: tramos con campo, más adelante del desfile, con cuánto
   * falta para que llegue. Solo con muestra suficiente, y solo los tramos que
   * se SABE que están tranquilos: un tramo sin datos no se recomienda.
   */
  const sugerencias = useMemo(() => {
    if (!verGentio || !densidad?.suficiente || !estado) return [];
    const cabeza = estado.posiciones.cabeza?.metros ?? 0;
    return densidad.bins
      .filter((b) => b.nivel === "tranquilo" && b.desdeM > cabeza + 150)
      .map((b) => {
        const centro = b.desdeM + BIN_M / 2;
        const e = calcularEta({ estado, metrosUsuario: centro, desvioUsuarioM: 0, desvioMaxM: DESVIO_MAX_USUARIO_M, ahora });
        return {
          centro,
          lugar: hitoMasCercano(centro)?.nombre ?? "",
          llega: e.tipo === "llegando" ? { a: e.minMin, b: e.maxMin } : null,
          // Lo más cerca de donde ya está; si no dio ubicación, lo más próximo al desfile.
          orden: Math.abs(centro - (metrosUsuario ?? cabeza)),
        };
      })
      .sort((a, b) => a.orden - b.orden)
      .slice(0, 3);
  }, [verGentio, densidad, estado, metrosUsuario, ahora]);

  /** La oferta de un comercio destacado que queda a pocos pasos. Una a la vez, y se puede cerrar. */
  const ofertaCerca = useMemo(() => {
    if (!ubicacion || puntoSel) return null;
    let mejor: { c: Comercio; d: number } | null = null;
    for (const c of comercios) {
      if (c.plan !== "destacado" || c.id === ofertaCerrada || !promoVigente(c, estado)) continue;
      const d = distanciaHaversine(ubicacion.lat, ubicacion.lng, c.lat, c.lng);
      if (d <= RADIO_OFERTA_M && (!mejor || d < mejor.d)) mejor = { c, d };
    }
    return mejor;
  }, [ubicacion, comercios, estado, ofertaCerrada, puntoSel]);

  // Una impresión por oferta mostrada: es lo que se le cuenta al anunciante.
  const idOferta = ofertaCerca?.c.id ?? null;
  useEffect(() => {
    if (idOferta) contarMetrica(idOferta, "oferta");
  }, [idOferta]);

  const reencuadrar = (modo: "todo" | "yo" | "cabeza") => setEncuadre({ modo, nonce: Date.now() });
  const irA = (lat: number, lng: number) => setEncuadre({ modo: "punto", lat, lng, nonce: Date.now() });

  // Fondo de marca mientras se resuelve: evita que el mapa asome un frame
  // antes del inicio, y que el inicio asome para quien ya lo vio.
  // `fixed` y no `absolute`: el inicio va POR ENCIMA de la nav inferior, que
  // vive fuera de este componente. Es una pantalla previa a la app, no una pestaña.
  if (inicioVisto === null) return <div className="fixed inset-0 z-50 bg-marca" />;

  if (!inicioVisto) {
    return (
      <div className="fixed inset-0 z-50">
        <Inicio
          onSeguir={() => {
            pedir();
            marcarInicioVisto();
          }}
          onSaltar={marcarInicioVisto}
        />
      </div>
    );
  }

  const chip = (activa: boolean) =>
    `pointer-events-auto flex h-[34px] shrink-0 items-center gap-1.5 rounded-[17px] px-3 text-[13px] font-bold ${
      activa
        ? "bg-tinta text-papel shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)]"
        : "bg-blanco text-tinta-2 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.25)]"
    }`;
  const tarjeta = "pointer-events-auto mx-auto max-w-lg lg:mx-0 lg:max-w-[420px]";

  return (
    <div className="absolute inset-0 flex flex-col">
      <MapaDesfile
        estado={estado}
        puntos={puntos}
        densidad={verGentio ? densidad : null}
        puntoSeleccionado={puntoSel?.id ?? null}
        onPuntoClick={setPuntoSel}
        ubicacion={ubicacion}
        ahora={ahora}
        modoMarcarPunto={marcando}
        onPuntoMarcado={(lat, lng) => {
          fijarManual(lat, lng);
          setMarcando(false);
        }}
        encuadre={encuadre}
        encuentroM={encuentroM}
      />

      {/* --- Tarjeta de cabecera --- */}
      <header className="pt-seguro pointer-events-none relative z-10 px-3.5">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center gap-2.5 rounded-[18px] bg-blanco px-4 py-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.28)] lg:mx-0 lg:max-w-md">
          <span
            className="grid size-[22px] shrink-0 place-items-center rounded-md bg-marca"
            aria-hidden
          >
            <span className="size-[9px] rounded-full bg-papel" />
          </span>
          <h1 className="fuente-display truncate text-[17px] text-tinta">
            {estado?.nombre ?? "Sigue el Desfile"}
          </h1>
          {estado?.estado === "en_curso" && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-extrabold text-ok">
              <span className="latido size-2 rounded-full bg-ok" aria-hidden />
              {t("mapa.envivo")}
            </span>
          )}
        </div>
      </header>

      {/* --- Mensajes del equipo: lo primero que hay que leer --- */}
      {estado && estado.avisos.length > 0 && (
        <div className="pointer-events-none relative z-10 mt-2 px-3.5">
          <div className="pointer-events-auto mx-auto max-w-lg lg:mx-0 lg:max-w-md">
            <Avisos avisos={estado.avisos} />
          </div>
        </div>
      )}

      {/* --- Capas del mapa --- */}
      <div className="pointer-events-none relative z-10 mt-2.5 flex gap-[7px] overflow-x-auto px-3 pb-1 lg:flex-wrap lg:overflow-visible lg:pl-3.5">
        {CAPAS.filter((c) => c.id !== "servicio" || hayServicios).map((c) => {
          const activa = capas.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => alternarCapa(c.id)}
              aria-pressed={activa}
              className={chip(activa)}
            >
              {c.id === "desfile" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill={c.color} aria-hidden>
                  <path d="M6 3l12 9-12 9z" />
                </svg>
              ) : (
                <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
              )}
              {t(c.clave)}
            </button>
          );
        })}

        {/* El gentío es otra clase de capa: no es "qué hay", es "cómo está". */}
        <button
          type="button"
          onClick={() => setVerGentio((v) => !v)}
          aria-pressed={verGentio}
          className={chip(verGentio)}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.2" />
            <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
            <path d="M16 14c2.5 0 5 1.6 5 5" />
          </svg>
          {t("capa.gentio")}
        </button>
      </div>

      {!SENDA.oficial && (
        <p className="pointer-events-none relative z-10 mx-3 mt-1.5 self-start rounded-lg bg-blanco/90 px-2.5 py-1 text-[11px] font-semibold text-aviso-txt shadow-sm">
          {t("mapa.provisional")}
        </p>
      )}

      {encuentroM !== null && (
        <p className="pointer-events-auto relative z-10 mx-3 mt-1.5 self-start rounded-lg bg-tinta px-2.5 py-1.5 text-[12px] font-semibold text-papel shadow-sm">
          {t("mapa.encuentro")}: {referenciaEnSenda(encuentroM, "estas", t).frase.replace(/^(estás|you're) /, "")}.{" "}
          <button type="button" onClick={() => setEncuentroM(null)} className="underline underline-offset-2">
            {t("mapa.quitar")}
          </button>
        </p>
      )}

      {/* --- Controles flotantes --- */}
      <div className="pointer-events-none relative z-10 mt-auto flex items-end justify-between gap-2 px-3.5 pb-2.5 lg:justify-end lg:gap-3 lg:pb-5">
        <div className="flex flex-col items-start gap-2.5">
          <button
            type="button"
            onClick={() => reencuadrar("cabeza")}
            className="pointer-events-auto flex h-11 items-center gap-2 rounded-[22px] bg-tinta px-4 text-sm font-bold text-papel shadow-[0_6px_16px_-4px_rgba(0,0,0,0.4)] active:opacity-90"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--color-cabeza)" aria-hidden>
              <path d="M6 3l12 9-12 9z" />
            </svg>
            {t("mapa.llevame")}
          </button>

          <button
            type="button"
            onClick={() => (ubicacion ? reencuadrar("yo") : pedir())}
            aria-label={ubicacion ? t("mapa.centrar") : t("mapa.usarUbicacion")}
            className="pointer-events-auto grid size-11 place-items-center rounded-full border-[1.5px] border-borde-2 bg-blanco shadow-[0_6px_16px_-6px_rgba(0,0,0,0.3)] active:bg-papel-2"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-usuario)"
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

        {MODO_DATOS === "local" && <PanelSimulacion />}
      </div>

      {/* --- Gentío: consentimiento y estado de la muestra --- */}
      {verGentio && compartir === "sin_decidir" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${tarjeta} rounded-2xl border border-borde-2 bg-blanco p-3.5 shadow-lg`}>
            <p className="text-sm font-bold text-tinta">{t("gentio.pregunta")}</p>
            <p className="mt-1 text-[13px] leading-snug text-tinta-3">{t("gentio.explica")}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => decidirCompartir("si")}
                className="flex-1 rounded-full bg-tinta px-3 py-2.5 text-[13px] font-bold text-papel"
              >
                {t("gentio.si")}
              </button>
              <button
                type="button"
                onClick={() => decidirCompartir("no")}
                className="flex-1 rounded-full border border-borde-2 px-3 py-2.5 text-[13px] font-bold text-tinta"
              >
                {t("gentio.no")}
              </button>
            </div>
          </div>
        </div>
      )}

      {verGentio && compartir !== "sin_decidir" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${tarjeta} rounded-xl bg-blanco/95 px-3 py-2 shadow-md`}>
            {densidad?.suficiente ? (
              <>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-tinta-3">
                  {(["tranquilo", "con_gente", "lleno"] as const).map((n) => (
                    <span key={n} className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: COLOR_NIVEL[n] }} aria-hidden />
                      {t(`gentio.${n}`)}
                    </span>
                  ))}
                  <span className="text-tinta-4">· {t("gentio.personas", { n: densidad.total })}</span>
                  <button
                    type="button"
                    aria-expanded={verSugerencias}
                    onClick={() => setVerSugerencias((v) => !v)}
                    className="ml-auto rounded-full bg-tinta px-3 py-1 text-[12px] font-bold text-papel"
                  >
                    {t("gentio.donde")}
                  </button>
                </div>
                {verSugerencias && (
                  <div className="mt-2 border-t border-borde pt-2">
                    {sugerencias.length === 0 ? (
                      <p className="text-[12px] font-semibold text-tinta-3">{t("gentio.sinSugerencias")}</p>
                    ) : (
                      <ul className="space-y-1">
                        {sugerencias.map((s) => {
                          const p = puntoEnMetro(s.centro);
                          return (
                            <li key={s.centro}>
                              <button
                                type="button"
                                onClick={() => irA(p.lat, p.lng)}
                                className="w-full rounded-lg px-1 py-1 text-left text-[13px] text-tinta active:bg-papel-2"
                              >
                                <b>{t("gentio.sugerencia", { lugar: s.lugar })}</b>
                                {s.llega && (
                                  <span className="text-tinta-3"> · {t("gentio.llegaEn", s.llega)}</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {/* Mandar gente a un punto tiene un riesgo que decir "allá está lleno" no tiene. */}
                    <p className="mt-1.5 text-[11px] leading-snug text-tinta-4">{t("gentio.aviso")}</p>
                  </div>
                )}
              </>
            ) : (
              /* Nunca pintar la senda "vacía" con cuatro usuarios: eso mandaría
                 gente a un sitio del que no se sabe nada. */
              <p className="text-[12px] leading-snug font-semibold text-tinta-3">
                {t("gentio.insuficiente", {
                  min: MIN_USUARIOS_GLOBAL,
                  actual: densidad ? t("gentio.actual", { n: densidad.total }) : "",
                })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- Oferta cerca: pauta, y se dice --- */}
      {ofertaCerca && !marcando && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className={`${tarjeta} flex items-center gap-2.5 rounded-2xl border border-dashed border-[#d8b96a] bg-papel px-3.5 py-2.5 shadow-md`}>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setCapas((c) => new Set(c).add("comercio"));
                const c = ofertaCerca.c;
                setPuntoSel({
                  id: c.id, nombre: c.nombre, lat: c.lat, lng: c.lng, categoria: c.categoria, grupo: "comercio",
                  descripcion: c.descripcion, direccion: c.direccion, horario: c.horario, promo: c.promo,
                  plan: c.plan, menu: c.menu, whatsapp: c.whatsapp, enlace: c.enlace,
                });
                irA(c.lat, c.lng);
              }}
            >
              <span className="text-[10px] font-extrabold tracking-[1.2px] text-[#8a7020]">
                {t("ficha.pauta")} · {t("oferta.cerca")}
              </span>
              <span className="block truncate text-[14px] font-extrabold text-tinta">{ofertaCerca.c.promo}</span>
              <span className="block truncate text-[12px] text-tinta-3">{ofertaCerca.c.nombre}</span>
            </button>
            <button
              type="button"
              aria-label={t("ficha.cerrar")}
              onClick={() => setOfertaCerrada(ofertaCerca.c.id)}
              className="grid size-8 shrink-0 place-items-center rounded-full text-tinta-3 active:bg-papel-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* --- Avisos --- */}
      {marcando && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <p className={`${tarjeta} rounded-xl border border-usuario/40 bg-blanco px-3 py-2.5 text-center text-[13px] text-tinta shadow-md`}>
            {t("mapa.tocaDonde")}{" "}
            <button
              type="button"
              onClick={() => setMarcando(false)}
              className="font-bold underline underline-offset-2"
            >
              {t("mapa.cancelar")}
            </button>
          </p>
        </div>
      )}

      {!marcando && mensajeError && permiso !== "concedido" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <p className="mx-auto max-w-lg rounded-xl bg-blanco px-3 py-2 text-center text-[12px] text-tinta-2 shadow-md lg:mx-0 lg:max-w-[420px]">
            {mensajeError}
          </p>
        </div>
      )}

      {!marcando && ubicacion?.manual && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-1.5">
          <p className={`${tarjeta} text-center text-[12px] font-semibold text-tinta-3`}>
            {/* Confirmarle dónde cree la app que está, con una referencia que
                reconozca: es la única forma de que detecte si se equivocó. */}
            {referenciaEnSenda(ubicacion.proyeccion.metros, "estas", t).frase || t("mapa.puntoManual")}
            .{" "}
            <button type="button" onClick={limpiarManual} className="underline underline-offset-2">
              {t("mapa.usarGps")}
            </button>
          </p>
        </div>
      )}

      {/* --- Abajo: la ficha del comercio, o la respuesta a la pregunta que importa ---
          En escritorio deja de ser una hoja a todo el ancho y se vuelve una
          tarjeta anclada abajo a la izquierda: a 1.500 px, un titular de 26 px
          centrado en toda la pantalla se lee peor, no mejor. */}
      <div className="relative z-10 lg:mb-5 lg:ml-3.5 lg:w-[420px]">
        {puntoSel ? (
          <FichaPunto
            punto={puntoSel}
            distanciaM={distanciaAlPunto}
            onCerrar={() => setPuntoSel(null)}
            onLlevame={() => irA(puntoSel.lat, puntoSel.lng)}
          />
        ) : (
          <BarraEta
            eta={eta}
            estado={estado}
            conexion={conexion}
            ahora={ahora}
            metrosUsuario={
              ubicacion && ubicacion.proyeccion.desvioM <= DESVIO_MAX_USUARIO_M ? metrosUsuario : null
            }
            onPedirUbicacion={pedir}
            onMarcarPunto={() => setMarcando(true)}
          />
        )}
      </div>
    </div>
  );
}
