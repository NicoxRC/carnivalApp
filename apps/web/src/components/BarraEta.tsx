"use client";

import { useState } from "react";

import type { Eta } from "@/lib/eta";
import { distanciaCorta, haceCuanto, horaCorta } from "@/lib/formato";
import { useAvisoCercania } from "@/lib/hooks/useAvisoCercania";
import type { Conexion } from "@/lib/hooks/useEstadoDesfile";
import { useIdioma, type Traductor } from "@/lib/i18n";
import { referenciaEnSenda } from "@/lib/senda";
import type { EstadoDesfile } from "@/lib/tipos";

interface Props {
  eta: Eta;
  estado: EstadoDesfile | null;
  conexion: Conexion;
  ahora: number;
  /** Metros del usuario sobre la senda; null si no dio ubicación. */
  metrosUsuario: number | null;
  onPedirUbicacion: () => void;
  onMarcarPunto: () => void;
}

/**
 * La hoja blanca de abajo. Es el producto: responde la única pregunta que
 * importa. El diseño resolvió el estado feliz; los demás están escritos en el
 * mismo registro pastuso, que es el que da el diseño.
 */

const kmh = (v: number) => v.toFixed(1).replace(".", ",");

function Titular({ eta, t }: { eta: Eta; t: Traductor }) {
  const base = "text-[26px] leading-[1.12] font-extrabold tracking-[-0.3px] text-tinta";

  switch (eta.tipo) {
    case "llegando":
      return (
        <p className={base}>
          {t("eta.llegando")}{" "}
          <span className="text-cabeza-txt">
            {eta.minMin}–{eta.maxMin} min
          </span>
        </p>
      );
    case "detenido":
      return (
        <p className={base}>
          <span className="text-alerta">{t("eta.detenido")}</span>
          <span className="text-tinta-2">{t("eta.detenido.hace", { n: eta.detenidoHaceMin })}</span>
        </p>
      );
    case "sin_senal":
      // Sin un tiempo a propósito: sería calcular sobre dónde ESTABA el desfile.
      return <p className={`${base} text-aviso-txt`}>{t("eta.sinSenal", { n: eta.haceMin })}</p>;
    case "aqui":
      return <p className={`${base} text-cabeza-txt`}>{t("eta.aqui")}</p>;
    case "ya_paso":
      return (
        <p className={base}>
          {eta.colaYaPaso ? (
            t("eta.yaPasoTodo")
          ) : (
            <>
              {t("eta.cabezaPaso")}
              {eta.distanciaColaM !== null && (
                <span className="text-tinta-2">
                  {t("eta.colaVa", { d: distanciaCorta(eta.distanciaColaM) })}
                </span>
              )}
            </>
          )}
        </p>
      );
    case "sin_datos":
      if (eta.motivo === "sin_ubicacion") return <p className={base}>{t("eta.dondeEstas")}</p>;
      if (eta.motivo === "fuera_de_senda") return <p className={base}>{t("eta.lejos")}</p>;
      return <p className={base}>{t("eta.noArranca")}</p>;
  }
}

function Detalle({ eta, t }: { eta: Eta; t: Traductor }) {
  // "Termina de pasar en…": la otra mitad de la pregunta, para quien ya lo tiene encima.
  const cola =
    "colaEn" in eta && eta.colaEn ? (
      <> {t("eta.colaEn", { a: eta.colaEn.minMin, b: eta.colaEn.maxMin })}</>
    ) : null;

  switch (eta.tipo) {
    case "llegando":
      return (
        <>
          {t("eta.d.va", { d: distanciaCorta(eta.distanciaM) })}
          {t(eta.velocidadMedida ? "eta.d.medida" : "eta.d.estimada", { v: kmh(eta.velocidadKmh) })}
          {eta.sinAvanzarMin !== null && (
            <span className="font-semibold text-aviso-txt">
              {t("eta.d.sinMoverse", { n: eta.sinAvanzarMin })}
            </span>
          )}
          .{cola}
        </>
      );
    case "detenido":
      return <>{t("eta.d.cabezaA", { d: distanciaCorta(eta.distanciaM) })}</>;
    case "sin_senal":
      return <>{t("eta.d.sinSenal", { d: distanciaCorta(eta.distanciaM) })}</>;
    case "aqui":
      return (
        <>
          {t("eta.d.estasA", { d: distanciaCorta(eta.distanciaM) })}
          {cola}
        </>
      );
    case "ya_paso":
      return (
        <>
          {t("eta.d.adelante", { d: distanciaCorta(eta.distanciaCabezaM) })}
          {cola}
        </>
      );
    case "sin_datos":
      if (eta.motivo === "sin_ubicacion") return <>{t("eta.d.sinUbicacion")}</>;
      if (eta.motivo === "fuera_de_senda") return <>{t("eta.d.acercate")}</>;
      return <>{t("eta.d.sinReportes")}</>;
  }
}

const COLOR_CONEXION: Record<Conexion, string> = {
  conectando: "text-tinta-3",
  en_vivo: "text-ok",
  reintentando: "text-aviso-txt",
  sin_conexion: "text-alerta",
};

const PUNTO_CONEXION: Record<Conexion, string> = {
  conectando: "bg-tinta-4",
  en_vivo: "bg-ok latido",
  reintentando: "bg-mitad",
  sin_conexion: "bg-alerta",
};

export function BarraEta({
  eta,
  estado,
  conexion,
  ahora,
  metrosUsuario,
  onPedirUbicacion,
  onMarcarPunto,
}: Props) {
  const { t } = useIdioma();
  const [copiado, setCopiado] = useState(false);
  const cabeza = estado?.posiciones.cabeza ?? null;
  // En referencias que la gente reconoce, no en nombres de calle.
  const referencia = cabeza ? referenciaEnSenda(cabeza.metros, "va", t) : null;
  const necesitaUbicacion = eta.tipo === "sin_datos" && eta.motivo !== "sin_reporte";

  const { aviso, activar, quitar } = useAvisoCercania(
    eta,
    t("aviso.titulo", { nombre: estado?.nombre ?? "" }),
    (n) => t("aviso.cuerpo", { n }),
  );
  // El aviso solo tiene sentido si el desfile todavía viene hacia el usuario.
  const puedeAvisar =
    metrosUsuario !== null && (eta.tipo === "llegando" || eta.tipo === "detenido" || eta.tipo === "sin_senal");

  const compartir = async () => {
    if (metrosUsuario === null) return;
    const url = `${window.location.origin}/?encuentro=${Math.round(metrosUsuario)}`;
    const texto = t("eta.compartirTexto", {
      donde: referenciaEnSenda(metrosUsuario, "estas", t).frase.replace(/^(estás|you're) /, ""),
      eta: eta.tipo === "llegando" ? t("eta.compartirEta", { a: eta.minMin, b: eta.maxMin }) : "",
    });
    try {
      if (navigator.share) await navigator.share({ text: texto, url });
      else {
        await navigator.clipboard.writeText(`${texto} ${url}`);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
      }
    } catch {
      // Canceló el menú de compartir: no es un error.
    }
  };

  return (
    <div className="rounded-t-[26px] bg-blanco px-5 pt-5 pb-4 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.28)] lg:rounded-[26px] lg:border lg:border-borde-2 lg:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.34)]">
      <div className="mx-auto max-w-lg">
        <div aria-live="polite">
          <Titular eta={eta} t={t} />
        </div>

        <p className="mt-2 text-[15px] leading-snug text-tinta-2">
          <Detalle eta={eta} t={t} />
        </p>

        {necesitaUbicacion && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onPedirUbicacion}
              className="flex-1 rounded-full bg-tinta px-4 py-3 text-sm font-bold text-papel active:opacity-90"
            >
              {t("mapa.usarUbicacion")}
            </button>
            <button
              type="button"
              onClick={onMarcarPunto}
              className="flex-1 rounded-full border border-borde-2 bg-blanco px-4 py-3 text-sm font-bold text-tinta active:bg-papel-2"
            >
              {t("mapa.marcar")}
            </button>
          </div>
        )}

        {metrosUsuario !== null && !necesitaUbicacion && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {puedeAvisar && aviso.modo === "apagado" && (
              <button
                type="button"
                onClick={() => void activar(metrosUsuario)}
                className="flex h-10 items-center gap-2 rounded-full bg-tinta px-4 text-[13px] font-bold text-papel active:opacity-90"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-mitad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9zM10 20a2 2 0 0 0 4 0" />
                </svg>
                {t("eta.avisame")}
              </button>
            )}
            {(aviso.modo === "push" || aviso.modo === "local") && (
              <p className="flex min-h-10 items-center gap-2 rounded-2xl bg-papel px-3.5 py-1.5 text-[13px] font-semibold text-tinta-2">
                {t(aviso.modo === "push" ? "eta.avisoListo" : "eta.avisoListoAbierta", { n: aviso.umbralMin })}
                <button type="button" onClick={() => void quitar()} className="shrink-0 font-bold underline underline-offset-2">
                  {t("eta.avisoQuitar")}
                </button>
              </p>
            )}
            {aviso.modo === "negado" && (
              <p className="text-[13px] font-semibold text-aviso-txt">{t("eta.avisoNegado")}</p>
            )}
            <button
              type="button"
              onClick={() => void compartir()}
              className="flex h-10 items-center gap-2 rounded-full border border-borde-2 bg-blanco px-4 text-[13px] font-bold text-tinta active:bg-papel-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 15V3m0 0L8 7m4-4l4 4M5 12v7h14v-7" />
              </svg>
              {copiado ? t("eta.copiado") : t("eta.compartir")}
            </button>
          </div>
        )}

        {/* De dónde salió este dato y cuándo. Nunca un spinner sin explicación. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-borde pt-3 text-[13px] text-tinta-3">
          <span className={`inline-flex items-center gap-1.5 font-bold ${COLOR_CONEXION[conexion]}`}>
            <span className={`size-2 rounded-full ${PUNTO_CONEXION[conexion]}`} aria-hidden />
            {t(`eta.conexion.${conexion}`)}
          </span>
          <span className="text-borde-3" aria-hidden>
            ·
          </span>
          {cabeza ? (
            <>
              <span>{t("eta.ultimas", { hace: haceCuanto(cabeza.ts, ahora, t), hora: horaCorta(cabeza.ts) })}</span>
              {referencia?.frase && (
                <>
                  <span className="text-borde-3" aria-hidden>
                    ·
                  </span>
                  <span className="truncate font-semibold text-tinta-2">{referencia.frase}</span>
                </>
              )}
            </>
          ) : (
            <span>{t("eta.sinSenas")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
