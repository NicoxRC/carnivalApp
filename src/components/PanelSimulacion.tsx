"use client";

import { useCallback, useEffect, useState } from "react";

interface EstadoSim {
  corriendo: boolean;
  velocidadKmh: number | null;
  avanceM: number | null;
  parado: boolean | null;
  longitudSendaM: number;
}

/**
 * El botón que permite mostrar la app funcionando en una sala de juntas en octubre,
 * sin desfile y sin salir a la calle. Escribe por la misma API que un reportero real.
 */
export function PanelSimulacion({ desfileId }: { desfileId: string }) {
  const [sim, setSim] = useState<EstadoSim | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [velocidad, setVelocidad] = useState(1.5);

  const leer = useCallback(async () => {
    try {
      const r = await fetch(`/api/simulacion?desfile=${encodeURIComponent(desfileId)}`, {
        cache: "no-store",
      });
      if (r.ok) setSim((await r.json()) as EstadoSim);
    } catch {
      // Si no responde, el panel simplemente no se muestra activo.
    }
  }, [desfileId]);

  useEffect(() => {
    void leer();
    const t = setInterval(leer, 5000);
    return () => clearInterval(t);
  }, [leer]);

  const enviar = async (accion: "iniciar" | "detener" | "reiniciar") => {
    setOcupado(true);
    try {
      const r = await fetch("/api/simulacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, desfileId, velocidadKmh: velocidad }),
      });
      if (r.ok) setSim((await r.json()) as EstadoSim);
    } catch {
      // nada: el estado se recupera en el siguiente sondeo
    } finally {
      setOcupado(false);
    }
  };

  const corriendo = sim?.corriendo ?? false;

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="pointer-events-auto rounded-full border border-borde-2 bg-blanco px-3 py-1.5 text-[11px] font-bold text-tinta-2 shadow-sm active:bg-papel-2"
      >
        {corriendo ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-cabeza" aria-hidden />
            Simulación activa
          </span>
        ) : (
          "Modo demo"
        )}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto w-64 rounded-xl border border-borde-2 bg-blanco p-3 text-tinta shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-wide text-tinta-3 uppercase">Modo demo</h2>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cerrar panel de demo"
          className="text-tinta-4 active:text-tinta"
        >
          ✕
        </button>
      </div>

      <p className="mb-3 text-[11px] leading-snug text-tinta-3">
        Mueve un desfile falso por la senda escribiendo en la misma API que usaría un
        reportero real.
      </p>

      <label className="mb-3 block text-[11px] text-tinta-2">
        Velocidad: {velocidad.toFixed(1).replace(".", ",")} km/h
        <input
          type="range"
          min={0.5}
          max={6}
          step={0.5}
          value={velocidad}
          onChange={(e) => setVelocidad(Number(e.target.value))}
          className="mt-1 w-full accent-[#ff6a1f]"
        />
      </label>

      <div className="flex gap-2">
        {corriendo ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void enviar("detener")}
            className="flex-1 rounded-lg bg-tinta px-3 py-2 text-xs font-bold text-papel disabled:opacity-50"
          >
            Detener
          </button>
        ) : (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void enviar("iniciar")}
            className="flex-1 rounded-lg bg-cabeza px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Iniciar desfile
          </button>
        )}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void enviar("reiniciar")}
          className="rounded-lg border border-borde-2 px-3 py-2 text-xs font-bold text-tinta-2 disabled:opacity-50"
        >
          Reiniciar
        </button>
      </div>

      {sim && sim.avanceM !== null && (
        <p className="mt-2 text-[11px] text-tinta-3">
          Avance: {(sim.avanceM / 1000).toFixed(2).replace(".", ",")} de{" "}
          {(sim.longitudSendaM / 1000).toFixed(2).replace(".", ",")} km
          {sim.parado ? " · detenido" : ""}
        </p>
      )}
    </div>
  );
}
