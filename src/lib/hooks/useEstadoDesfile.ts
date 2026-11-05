"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MODO_DATOS } from "@/lib/datos";
import type { EstadoDesfile } from "@/lib/tipos";

export type Conexion = "conectando" | "en_vivo" | "reintentando" | "sin_conexion";

interface Resultado {
  estado: EstadoDesfile | null;
  conexion: Conexion;
  /** Diferencia entre el reloj del servidor y el del celular, en ms. */
  desfaseMs: number;
  /** Cuándo llegó el último dato, según el reloj local. */
  recibidoEn: number | null;
  refrescar: () => void;
}

const REINTENTO_BASE_MS = 1500;
const REINTENTO_MAX_MS = 20_000;

/**
 * Una sola fuente de estado para toda la UI, con dos transportes por debajo:
 * SSE en modo local, Supabase Realtime en modo supabase.
 * El resto de la app no sabe ni le importa cuál está activo.
 */
export function useEstadoDesfile(desfileId: string): Resultado {
  const [estado, setEstado] = useState<EstadoDesfile | null>(null);
  const [conexion, setConexion] = useState<Conexion>("conectando");
  const [desfaseMs, setDesfase] = useState(0);
  const [recibidoEn, setRecibidoEn] = useState<number | null>(null);

  const intentos = useRef(0);
  const vivo = useRef(true);

  const aplicar = useCallback((nuevo: EstadoDesfile) => {
    setEstado(nuevo);
    setDesfase(nuevo.servidorTs - Date.now());
    setRecibidoEn(Date.now());
    setConexion("en_vivo");
    intentos.current = 0;
  }, []);

  const refrescar = useCallback(async () => {
    try {
      const r = await fetch(`/api/estado?desfile=${encodeURIComponent(desfileId)}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(String(r.status));
      aplicar((await r.json()) as EstadoDesfile);
    } catch {
      // Nunca se borra lo que ya se tenía: se marca la conexión y se sigue
      // mostrando el último dato conocido con su hora.
      setConexion((c) => (c === "en_vivo" ? "reintentando" : "sin_conexion"));
    }
  }, [desfileId, aplicar]);

  // --- Primer dato: siempre por HTTP, para pintar la pantalla cuanto antes ---
  useEffect(() => {
    vivo.current = true;
    void refrescar();
    return () => {
      vivo.current = false;
    };
  }, [refrescar]);

  // --- Transporte en vivo ---
  useEffect(() => {
    if (MODO_DATOS === "supabase") return; // lo maneja el efecto de abajo
    let es: EventSource | null = null;
    let reconexion: ReturnType<typeof setTimeout> | null = null;
    let cerrado = false;

    const conectar = () => {
      if (cerrado) return;
      es = new EventSource(`/api/estado/stream?desfile=${encodeURIComponent(desfileId)}`);

      es.onmessage = (ev) => {
        try {
          aplicar(JSON.parse(ev.data) as EstadoDesfile);
        } catch {
          // Un mensaje corrupto no debe tumbar el stream.
        }
      };

      es.onerror = () => {
        es?.close();
        if (cerrado) return;
        intentos.current += 1;
        setConexion(intentos.current > 2 ? "sin_conexion" : "reintentando");
        const espera = Math.min(REINTENTO_BASE_MS * 2 ** (intentos.current - 1), REINTENTO_MAX_MS);
        // Jitter para no reconectar todos los celulares de la senda a la vez.
        reconexion = setTimeout(conectar, espera + Math.random() * 1000);
      };
    };

    conectar();

    return () => {
      cerrado = true;
      if (reconexion) clearTimeout(reconexion);
      es?.close();
    };
  }, [desfileId, aplicar]);

  // --- Supabase Realtime (camino de producción) ---
  useEffect(() => {
    if (MODO_DATOS !== "supabase") return;
    let cancelar: (() => void) | undefined;

    void (async () => {
      const { clienteNavegador } = await import("@/lib/datos/supabase");
      const sb = clienteNavegador();
      const canal = sb
        .channel(`posiciones:${desfileId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "posiciones",
            filter: `desfile_id=eq.${desfileId}`,
          },
          // El evento solo avisa "algo cambió"; el estado consolidado se relee.
          () => void refrescar(),
        )
        .subscribe((s) => {
          setConexion(s === "SUBSCRIBED" ? "en_vivo" : "reintentando");
        });

      cancelar = () => {
        void sb.removeChannel(canal);
      };
    })();

    return () => cancelar?.();
  }, [desfileId, refrescar]);

  // --- Red de seguridad: si el transporte en vivo muere sin avisar, sondear ---
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (recibidoEn === null || Date.now() - recibidoEn > 30_000) void refrescar();
    }, 15_000);
    return () => clearInterval(t);
  }, [refrescar, recibidoEn]);

  // Volver a la app tras bloquear la pantalla debe traer datos frescos, no los de hace 20 min.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [refrescar]);

  return { estado, conexion, desfaseMs, recibidoEn, refrescar };
}

/** Reloj que fuerza re-render para que los "hace X min" no se congelen. */
export function useReloj(intervaloMs = 1000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return ahora;
}
