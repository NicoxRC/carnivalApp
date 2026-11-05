"use client";

import type { Eta } from "@/lib/eta";
import { distanciaCorta, haceCuanto, horaCorta } from "@/lib/formato";
import { referenciaEnSenda } from "@/lib/senda";
import type { EstadoDesfile } from "@/lib/tipos";
import type { Conexion } from "@/lib/hooks/useEstadoDesfile";

interface Props {
  eta: Eta;
  estado: EstadoDesfile | null;
  conexion: Conexion;
  ahora: number;
  onPedirUbicacion: () => void;
  onMarcarPunto: () => void;
}

/**
 * La hoja blanca de abajo. Es el producto: responde la única pregunta que
 * importa. El diseño resolvió el estado feliz; los otros seis están escritos
 * en el mismo registro pastuso, que es el que da el diseño.
 */

function Titular({ eta }: { eta: Eta }) {
  const base = "text-[26px] leading-[1.12] font-extrabold tracking-[-0.3px] text-tinta";

  switch (eta.tipo) {
    case "llegando":
      return (
        <p className={base}>
          El desfile te cae en{" "}
          <span className="text-cabeza-txt">
            {eta.minMin}–{eta.maxMin} min
          </span>
        </p>
      );
    case "detenido":
      return (
        <p className={base}>
          <span className="text-alerta">El desfile está parado</span>
          <span className="text-tinta-2"> — lleva {eta.detenidoHaceMin} min quieto</span>
        </p>
      );
    case "aqui":
      return <p className={`${base} text-cabeza-txt`}>¡Ya te está pasando por delante!</p>;
    case "ya_paso":
      return (
        <p className={base}>
          {eta.colaYaPaso ? (
            <>Ya pasó todo por donde estás</>
          ) : (
            <>
              La cabeza ya pasó
              {eta.distanciaColaM !== null && (
                <span className="text-tinta-2">
                  {" "}
                  — la cola va a {distanciaCorta(eta.distanciaColaM)}
                </span>
              )}
            </>
          )}
        </p>
      );
    case "sin_datos":
      if (eta.motivo === "sin_ubicacion") return <p className={base}>¿En qué parte estás?</p>;
      if (eta.motivo === "fuera_de_senda")
        return <p className={base}>Estás lejos de la senda</p>;
      return <p className={base}>El desfile todavía no arranca</p>;
  }
}

function Detalle({ eta }: { eta: Eta }) {
  switch (eta.tipo) {
    case "llegando":
      return (
        <>
          Va a {distanciaCorta(eta.distanciaM)},{" "}
          {eta.velocidadMedida ? (
            <>andando a {eta.velocidadKmh.toFixed(1).replace(".", ",")} km/h</>
          ) : (
            <>a un ritmo calculado de {eta.velocidadKmh.toFixed(1).replace(".", ",")} km/h</>
          )}
          {eta.sinAvanzarMin !== null && (
            <span className="font-semibold text-aviso-txt">
              {" "}
              · sin moverse hace {eta.sinAvanzarMin} min
            </span>
          )}
        </>
      );
    case "detenido":
      return <>La cabeza está a {distanciaCorta(eta.distanciaM)} de donde estás.</>;
    case "aqui":
      return <>Estás a {distanciaCorta(eta.distanciaM)} de la cabeza.</>;
    case "ya_paso":
      return <>La cabeza va {distanciaCorta(eta.distanciaCabezaM)} más adelante.</>;
    case "sin_datos":
      if (eta.motivo === "sin_ubicacion")
        return <>Sin saber dónde estás no se puede calcular cuánto le falta.</>;
      if (eta.motivo === "fuera_de_senda")
        return <>Acercate a la senda, o marcá a mano dónde vas a esperarlo.</>;
      return <>Todavía no hay señas de ningún reportero.</>;
  }
}

const TEXTO_CONEXION: Record<Conexion, string> = {
  conectando: "conectando…",
  en_vivo: "en vivo",
  reintentando: "reconectando…",
  sin_conexion: "sin conexión",
};

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
  onPedirUbicacion,
  onMarcarPunto,
}: Props) {
  const cabeza = estado?.posiciones.cabeza ?? null;
  // En referencias que la gente reconoce, no en nombres de calle.
  const referencia = cabeza ? referenciaEnSenda(cabeza.metros, "va") : null;
  const necesitaUbicacion = eta.tipo === "sin_datos" && eta.motivo !== "sin_reporte";

  return (
    <div className="rounded-t-[26px] bg-blanco px-5 pt-5 pb-4 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.28)] lg:rounded-[26px] lg:border lg:border-borde-2 lg:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.34)]">
      <div className="mx-auto max-w-lg">
        <Titular eta={eta} />

        <p className="mt-2 text-[15px] leading-snug text-tinta-2">
          <Detalle eta={eta} />
        </p>

        {necesitaUbicacion && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onPedirUbicacion}
              className="flex-1 rounded-full bg-tinta px-4 py-3 text-sm font-bold text-papel active:opacity-90"
            >
              Usar mi ubicación
            </button>
            <button
              type="button"
              onClick={onMarcarPunto}
              className="flex-1 rounded-full border border-borde-2 bg-blanco px-4 py-3 text-sm font-bold text-tinta active:bg-papel-2"
            >
              Marcar en el mapa
            </button>
          </div>
        )}

        {/* De dónde salió este dato y cuándo. Nunca un spinner sin explicación. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-borde pt-3 text-[13px] text-tinta-3">
          <span className={`inline-flex items-center gap-1.5 font-bold ${COLOR_CONEXION[conexion]}`}>
            <span className={`size-2 rounded-full ${PUNTO_CONEXION[conexion]}`} aria-hidden />
            {TEXTO_CONEXION[conexion]}
          </span>
          {cabeza ? (
            <>
              <span className="text-borde-3" aria-hidden>
                ·
              </span>
              <span>
                últimas señas {haceCuanto(cabeza.ts, ahora)} ({horaCorta(cabeza.ts)})
              </span>
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
            <>
              <span className="text-borde-3" aria-hidden>
                ·
              </span>
              <span>sin señas todavía</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
