"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BarraEta } from "@/components/BarraEta";
import { Inicio } from "@/components/Inicio";
import { PanelSimulacion } from "@/components/PanelSimulacion";
import type { Encuadre, PuntoMapa } from "@/components/MapaDesfile";
import { FichaPunto } from "@/components/FichaPunto";
import datosComercios from "@/data/comercios-ejemplo.json";
import datosEventos from "@/data/eventos-ejemplo.json";
import { ETIQUETA_NIVEL, COLOR_NIVEL, MIN_USUARIOS_GLOBAL } from "@/lib/densidad";
import { MODO_DATOS } from "@/lib/datos";
import { calcularEta } from "@/lib/eta";
import { distanciaHaversine } from "@/lib/geo";
import { DESVIO_MAX_USUARIO_M, referenciaEnSenda, SENDA } from "@/lib/senda";
import { useEstadoDesfile, useReloj } from "@/lib/hooks/useEstadoDesfile";
import { useDensidad } from "@/lib/hooks/useDensidad";
import { useUbicacion } from "@/lib/hooks/useUbicacion";

// MapLibre toca `window` al importarse: fuera del render del servidor.
const MapaDesfile = dynamic(() => import("@/components/MapaDesfile"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-papel-2" />,
});

interface EventoCrudo {
  id: string;
  titulo: string;
  descripcion: string;
  lugarNombre: string;
  categoria: string;
  lat: number;
  lng: number;
}

interface ComercioCrudo {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string;
  direccion: string;
  horario: string;
  lat: number;
  lng: number;
  plan: string | null;
  promo: string | null;
}

/**
 * Las capas del mapa.
 *
 * "Comercios" reúne restaurantes, tascas, cafés, tiendas y droguerías: para
 * alguien parado en la senda todos responden la misma pregunta —dónde como,
 * dónde compro, dónde hay baño— y separarlos en cinco filtros solo añade
 * trabajo. El icono distingue de qué tipo es cada uno.
 *
 * El diseño proponía además Agua y Baños. Quedaron fuera: no existe fuente de
 * datos para ellos y un baño inventado en un mapa que alguien usa para buscar
 * un baño es peor que no ofrecer el filtro.
 */
const CAPAS = [
  { id: "desfile", etiqueta: "Desfile", color: "#ff6a1f" },
  { id: "comercio", etiqueta: "Comercios", color: "#2fa898" },
  { id: "presentacion", etiqueta: "Tarimas", color: "#a06bff" },
] as const;

type CapaId = (typeof CAPAS)[number]["id"];

const CLAVE_INICIO = "sed:inicio-visto";

export function PantallaMapa({ desfileId }: { desfileId: string }) {
  const { estado, conexion, desfaseMs } = useEstadoDesfile(desfileId);
  const { ubicacion, permiso, mensajeError, pedir, fijarManual, limpiarManual } = useUbicacion();
  const relojLocal = useReloj(1000);
  const [marcando, setMarcando] = useState(false);
  const [capas, setCapas] = useState<Set<CapaId>>(new Set<CapaId>(["desfile"]));
  const [encuadre, setEncuadre] = useState<Encuadre | null>(null);
  // null = todavía no sabemos si ya vio el inicio (localStorage solo existe tras montar).
  const [inicioVisto, setInicioVisto] = useState<boolean | null>(null);
  const [verGentio, setVerGentio] = useState(false);
  const [puntoSel, setPuntoSel] = useState<PuntoMapa | null>(null);

  useEffect(() => {
    try {
      setInicioVisto(localStorage.getItem(CLAVE_INICIO) === "1");
    } catch {
      // localStorage bloqueado: se salta el inicio en vez de repetirlo cada vez.
      setInicioVisto(true);
    }
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

  const eta = useMemo(() => {
    if (!estado) return { tipo: "sin_datos", motivo: "sin_reporte" } as const;
    return calcularEta({
      estado,
      metrosUsuario: ubicacion?.proyeccion.metros ?? null,
      desvioUsuarioM: ubicacion?.proyeccion.desvioM ?? null,
      desvioMaxM: DESVIO_MAX_USUARIO_M,
      ahora,
    });
  }, [estado, ubicacion, ahora]);

  const puntos = useMemo<PuntoMapa[]>(() => {
    const lista: PuntoMapa[] = [];

    if (capas.has("presentacion")) {
      for (const e of datosEventos.eventos as EventoCrudo[]) {
        if (e.categoria !== "presentacion") continue;
        lista.push({
          id: e.id,
          nombre: e.titulo,
          lat: e.lat,
          lng: e.lng,
          categoria: e.categoria,
          grupo: "tarima",
          descripcion: e.descripcion,
          direccion: e.lugarNombre,
        });
      }
    }

    if (capas.has("comercio")) {
      for (const c of datosComercios.comercios as ComercioCrudo[]) {
        lista.push({
          id: c.id,
          nombre: c.nombre,
          lat: c.lat,
          lng: c.lng,
          categoria: c.categoria,
          grupo: "comercio",
          descripcion: c.descripcion,
          direccion: c.direccion,
          horario: c.horario,
          promo: c.promo,
          plan: c.plan as PuntoMapa["plan"],
        });
      }
    }

    return lista;
  }, [capas]);

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

  const { densidad, compartir, decidirCompartir } = useDensidad(
    desfileId,
    verGentio,
    ubicacion?.proyeccion.metros ?? null,
  );

  const reencuadrar = (modo: "todo" | "yo" | "cabeza") => setEncuadre({ modo, nonce: Date.now() });

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
              EN VIVO
            </span>
          )}
        </div>
      </header>

      {/* --- Capas del mapa --- */}
      <div className="pointer-events-none relative z-10 mt-2.5 flex gap-[7px] overflow-x-auto px-3 pb-1 lg:flex-wrap lg:overflow-visible lg:pl-3.5">
        {CAPAS.map((c) => {
          const activa = capas.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => alternarCapa(c.id)}
              aria-pressed={activa}
              className={`pointer-events-auto flex h-[34px] shrink-0 items-center gap-1.5 rounded-[17px] px-3 text-[13px] font-bold ${
                activa
                  ? "bg-tinta text-papel shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)]"
                  : "bg-blanco text-tinta-2 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.25)]"
              }`}
            >
              {c.id === "desfile" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill={c.color} aria-hidden>
                  <path d="M6 3l12 9-12 9z" />
                </svg>
              ) : (
                <span
                  className="size-2 rounded-full"
                  style={{ background: c.color }}
                  aria-hidden
                />
              )}
              {c.etiqueta}
            </button>
          );
        })}

        {/* El gentío es otra clase de capa: no es "qué hay", es "cómo está". */}
        <button
          type="button"
          onClick={() => setVerGentio((v) => !v)}
          aria-pressed={verGentio}
          className={`pointer-events-auto flex h-[34px] shrink-0 items-center gap-1.5 rounded-[17px] px-3 text-[13px] font-bold ${
            verGentio
              ? "bg-tinta text-papel shadow-[0_4px_12px_-4px_rgba(0,0,0,0.35)]"
              : "bg-blanco text-tinta-2 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.25)]"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.2" />
            <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
            <path d="M16 14c2.5 0 5 1.6 5 5" />
          </svg>
          Gentío
        </button>
      </div>

      {!SENDA.oficial && (
        <p className="pointer-events-none relative z-10 mx-3 mt-1.5 self-start rounded-lg bg-blanco/90 px-2.5 py-1 text-[11px] font-semibold text-aviso-txt shadow-sm">
          Trazado provisional: no es la senda oficial de Corpocarnaval.
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
            Llevame al desfile
          </button>

          <button
            type="button"
            onClick={() => (ubicacion ? reencuadrar("yo") : pedir())}
            aria-label={ubicacion ? "Centrar en mi ubicación" : "Usar mi ubicación"}
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

        {MODO_DATOS === "local" && <PanelSimulacion desfileId={desfileId} />}
      </div>

      {/* --- Gentío: consentimiento y estado de la muestra --- */}
      {verGentio && compartir === "sin_decidir" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className="pointer-events-auto mx-auto max-w-lg rounded-2xl border border-borde-2 bg-blanco p-3.5 shadow-lg lg:mx-0 lg:max-w-[420px]">
            <p className="text-sm font-bold text-tinta">¿Ayudás a saber dónde hay gente?</p>
            <p className="mt-1 text-[13px] leading-snug text-tinta-3">
              La app manda cada minuto en qué tramo de la senda estás, sin nombre y sin
              guardar por dónde anduviste. Podés mirar el mapa igual sin compartir nada.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => decidirCompartir("si")}
                className="flex-1 rounded-full bg-tinta px-3 py-2.5 text-[13px] font-bold text-papel"
              >
                Sí, compartir
              </button>
              <button
                type="button"
                onClick={() => decidirCompartir("no")}
                className="flex-1 rounded-full border border-borde-2 px-3 py-2.5 text-[13px] font-bold text-tinta"
              >
                Solo mirar
              </button>
            </div>
          </div>
        </div>
      )}

      {verGentio && compartir !== "sin_decidir" && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <div className="pointer-events-auto mx-auto max-w-lg rounded-xl bg-blanco/95 px-3 py-2 shadow-md lg:mx-0 lg:max-w-[420px]">
            {densidad?.suficiente ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-tinta-3">
                {(["tranquilo", "con_gente", "lleno"] as const).map((n) => (
                  <span key={n} className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: COLOR_NIVEL[n] }}
                      aria-hidden
                    />
                    {ETIQUETA_NIVEL[n]}
                  </span>
                ))}
                <span className="text-tinta-4">· {densidad.total} personas ahora</span>
              </div>
            ) : (
              /* Nunca pintar la senda "vacía" con cuatro usuarios: eso mandaría
                 gente a un sitio del que no se sabe nada. */
              <p className="text-[12px] leading-snug font-semibold text-tinta-3">
                Todavía no hay suficiente gente usando la app para decir dónde hay
                aglomeración. Hacen falta al menos {MIN_USUARIOS_GLOBAL}
                {densidad ? ` y ahora mismo hay ${densidad.total}` : ""}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- Avisos --- */}
      {marcando && (
        <div className="pointer-events-none relative z-10 px-3.5 pb-2">
          <p className="pointer-events-auto mx-auto max-w-lg rounded-xl border border-usuario/40 bg-blanco px-3 py-2.5 text-center text-[13px] text-tinta shadow-md lg:mx-0 lg:max-w-[420px]">
            Tocá en el mapa dónde vas a esperar el desfile.{" "}
            <button
              type="button"
              onClick={() => setMarcando(false)}
              className="font-bold underline underline-offset-2"
            >
              Cancelar
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
          <p className="pointer-events-auto mx-auto max-w-lg text-center text-[12px] font-semibold text-tinta-3 lg:mx-0 lg:max-w-[420px]">
            {/* Confirmarle dónde cree la app que está, con una referencia que
                reconozca: es la única forma de que detecte si se equivocó. */}
            {referenciaEnSenda(ubicacion.proyeccion.metros, "estas").frase || "Punto marcado a mano"}
            .{" "}
            <button
              type="button"
              onClick={limpiarManual}
              className="underline underline-offset-2"
            >
              Usar el GPS
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
            onLlevame={() =>
              setEncuadre({
                modo: "punto",
                lat: puntoSel.lat,
                lng: puntoSel.lng,
                nonce: Date.now(),
              })
            }
          />
        ) : (
          <BarraEta
            eta={eta}
            estado={estado}
            conexion={conexion}
            ahora={ahora}
            onPedirUbicacion={pedir}
            onMarcarPunto={() => setMarcando(true)}
          />
        )}
      </div>
    </div>
  );
}
