"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { EstadoDesfile } from "@/lib/tipos";

export type Conexion = "conectando" | "en_vivo" | "reintentando" | "sin_conexion";

interface Resultado {
  estado: EstadoDesfile | null;
  conexion: Conexion;
  /** Diferencia entre el reloj del servidor y el del celular, en ms. */
  desfaseMs: number;
  /** Cuándo llegó el último dato FRESCO, según el reloj local. */
  recibidoEn: number | null;
  refrescar: () => void;
}

const REINTENTO_BASE_MS = 1500;
const REINTENTO_MAX_MS = 20_000;

/**
 * Una sola fuente de estado para toda la UI: el primer dato por HTTP y luego
 * SSE en vivo, con sondeo de respaldo si el stream muere sin avisar.
 *
 * Siempre sigue el desfile ACTUAL: el servidor decide cuál es (el que está en
 * curso, o el próximo). La app no le pregunta al usuario qué desfile quiere.
 */
export function useEstadoDesfile(): Resultado {
  const [estado, setEstado] = useState<EstadoDesfile | null>(null);
  const [conexion, setConexion] = useState<Conexion>("conectando");
  const [desfaseMs, setDesfase] = useState(0);
  const [recibidoEn, setRecibidoEn] = useState<number | null>(null);
  /** Sube cuando hay que reabrir el stream (cambió el desfile actual). */
  const [reapertura, setReapertura] = useState(0);

  const intentos = useRef(0);
  const ultimo = useRef<EstadoDesfile | null>(null);
  const desfileDelStream = useRef<string | null>(null);

  /**
   * `deCache` = la respuesta la devolvió el service worker porque no hubo red.
   * Es la diferencia entre "dato nuevo" y "lo último que se alcanzó a guardar",
   * y tratarlos igual era un bug grave: sin conexión, la app decía «en vivo ·
   * ahora mismo» con datos de hace cinco minutos, porque medía la antigüedad
   * contra el reloj del servidor que venía en la misma copia vieja.
   */
  const aplicar = useCallback((nuevo: EstadoDesfile, deCache = false) => {
    const previo = ultimo.current;
    // Nunca retroceder: una copia guardada no puede pisar algo más reciente.
    if (previo && previo.desfileId === nuevo.desfileId && nuevo.servidorTs < previo.servidorTs) {
      if (deCache) setConexion((c) => (c === "en_vivo" ? "reintentando" : c));
      return;
    }
    ultimo.current = nuevo;
    setEstado(nuevo);

    if (deCache) {
      // Se muestra, pero como lo que es: sin tocar el reloj ni la marca de
      // "recibido", para que el "hace X min" siga creciendo de verdad.
      setConexion((c) => (c === "en_vivo" ? "reintentando" : c === "conectando" ? "sin_conexion" : c));
      return;
    }
    setDesfase(nuevo.servidorTs - Date.now());
    setRecibidoEn(Date.now());
    setConexion("en_vivo");
    intentos.current = 0;
    // El servidor pasó a otro desfile (terminó uno, arrancó el siguiente):
    // el stream abierto sigue atado al anterior y hay que reabrirlo.
    if (desfileDelStream.current && desfileDelStream.current !== nuevo.desfileId) {
      desfileDelStream.current = null;
      setReapertura((n) => n + 1);
    }
  }, []);

  const refrescar = useCallback(async () => {
    try {
      const r = await fetch("/api/estado", { cache: "no-store" });
      if (r.status === 404) {
        // No hay ningún desfile programado: no es un error de red.
        setConexion("en_vivo");
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      aplicar((await r.json()) as EstadoDesfile, r.headers.get("X-Desde-Cache") === "1");
    } catch {
      // Nunca se borra lo que ya se tenía: se marca la conexión y se sigue
      // mostrando el último dato conocido con su hora.
      setConexion((c) => (c === "en_vivo" ? "reintentando" : "sin_conexion"));
    }
  }, [aplicar]);

  // --- Primer dato: siempre por HTTP, para pintar la pantalla cuanto antes ---
  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  // --- Transporte en vivo: SSE ---
  useEffect(() => {
    let es: EventSource | null = null;
    let reconexion: ReturnType<typeof setTimeout> | null = null;
    let cerrado = false;

    const conectar = () => {
      if (cerrado) return;
      es = new EventSource("/api/estado/stream");

      es.onmessage = (ev) => {
        try {
          const nuevo = JSON.parse(ev.data) as EstadoDesfile;
          desfileDelStream.current = nuevo.desfileId;
          aplicar(nuevo);
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
  }, [aplicar, reapertura]);

  // --- Red de seguridad: si el transporte en vivo muere sin avisar, sondear ---
  // (Y, cada dos minutos, mirar si el desfile actual ya es otro.)
  useEffect(() => {
    let vueltas = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      vueltas++;
      if (recibidoEn === null || Date.now() - recibidoEn > 30_000 || vueltas % 8 === 0) void refrescar();
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
