"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * El motor del panel de reporteros.
 *
 * Con el panel abierto, el celular manda su GPS solo cada INTERVALO_ENVIO_MS.
 * El reportero no tiene que tocar nada; el botón «Estoy aquí» es para forzar
 * un envío (p. ej. cuando el desfile se para o vuelve a arrancar).
 *
 * Tres cosas que pasan sí o sí en la senda y que esto tiene que aguantar:
 *  1. La red se cae. Cada punto entra a una cola guardada en el celular y sale
 *     cuando vuelva la señal, en un solo envío.
 *  2. La pantalla se apaga. En la web el GPS se detiene con la pantalla
 *     bloqueada, así que se pide mantenerla encendida (Wake Lock) y, si el
 *     navegador no deja, se avisa.
 *  3. El reloj del celular está corrido. La hora de cada punto se corrige con
 *     la del servidor; si no, el servidor los descartaría por "venir del futuro".
 */

/** Cada cuánto sale un punto solo. 20 s: el ETA necesita varios puntos por minuto para ver si el desfile se paró. */
export const INTERVALO_ENVIO_MS = 20_000;
/** Un fix de GPS más viejo que esto no se manda: el reportero ya no está ahí. */
const FIX_VIEJO_MS = 60_000;
const MAX_COLA = 200;
const CLAVE_COLA = "sed:reportero:cola";

export interface Fix {
  lat: number;
  lng: number;
  precisionM: number;
  ts: number;
}

type Punto =
  | { lat: number; lng: number; precisionM: number; ts: number }
  | { hitoId: string; ts: number };

export type EstadoGps = "apagado" | "buscando" | "ok" | "denegado" | "error";
export type EstadoRed = "ok" | "sin_senal" | "sesion_vencida";

export interface Reporte {
  activo: boolean;
  gps: EstadoGps;
  fix: Fix | null;
  red: EstadoRed;
  /** Cuándo llegó al servidor el último punto (reloj local). */
  ultimoEnvio: number | null;
  pendientes: number;
  /** null = el navegador no soporta mantener la pantalla encendida. */
  pantallaEncendida: boolean | null;
  empezar: () => void;
  terminar: () => void;
  /** Manda ya el GPS actual. false si todavía no hay GPS. */
  estoyAqui: () => boolean;
  marcarHito: (hitoId: string) => void;
}

function leerCola(): Punto[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_COLA) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as Punto[]).slice(-MAX_COLA) : [];
  } catch {
    return [];
  }
}

function guardarCola(cola: Punto[]) {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
  } catch {
    // Sin almacenamiento la cola vive solo en memoria: se pierde si se recarga.
  }
}

type WakeLockSentinel = { release: () => Promise<void>; addEventListener: (e: "release", cb: () => void) => void };
type ConWakeLock = Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } };

export function useReporte(onSesionVencida: () => void): Reporte {
  const [activo, setActivo] = useState(false);
  const [gps, setGps] = useState<EstadoGps>("apagado");
  const [fix, setFix] = useState<Fix | null>(null);
  const [red, setRed] = useState<EstadoRed>("ok");
  const [ultimoEnvio, setUltimoEnvio] = useState<number | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [pantallaEncendida, setPantalla] = useState<boolean | null>(false);

  const cola = useRef<Punto[]>([]);
  const fixRef = useRef<Fix | null>(null);
  const desfaseMs = useRef(0);
  const enviando = useRef(false);
  const watchId = useRef<number | null>(null);
  const bloqueo = useRef<WakeLockSentinel | null>(null);
  const sesionVencida = useRef(onSesionVencida);
  sesionVencida.current = onSesionVencida;

  // Lo que quedó en cola de una sesión anterior (se cerró la app sin señal).
  useEffect(() => {
    cola.current = leerCola();
    setPendientes(cola.current.length);
  }, []);

  const encolar = useCallback((p: Punto) => {
    cola.current = [...cola.current, p].slice(-MAX_COLA);
    guardarCola(cola.current);
    setPendientes(cola.current.length);
  }, []);

  const vaciarCola = useCallback(async () => {
    if (enviando.current || cola.current.length === 0) return;
    enviando.current = true;
    const lote = cola.current;
    try {
      const r = await fetch("/api/posiciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // La hora se pasa al reloj del servidor justo al enviar.
        body: JSON.stringify(lote.map((p) => ({ ...p, ts: p.ts + desfaseMs.current }))),
      });
      if (r.status === 401) {
        setRed("sesion_vencida");
        sesionVencida.current();
        return;
      }
      if (!r.ok) {
        // Un 400 no se arregla reintentando: se bota el lote para no atascar la cola.
        if (r.status === 400) {
          cola.current = cola.current.slice(lote.length);
          guardarCola(cola.current);
          setPendientes(cola.current.length);
        }
        setRed("sin_senal");
        return;
      }
      const res = (await r.json()) as { servidorTs?: number };
      if (typeof res.servidorTs === "number") desfaseMs.current = res.servidorTs - Date.now();
      // Solo se quita lo que se mandó: mientras tanto pudo entrar otro punto.
      cola.current = cola.current.slice(lote.length);
      guardarCola(cola.current);
      setPendientes(cola.current.length);
      setUltimoEnvio(Date.now());
      setRed("ok");
    } catch {
      setRed("sin_senal");
    } finally {
      enviando.current = false;
    }
  }, []);

  const encolarFix = useCallback((): boolean => {
    const f = fixRef.current;
    if (!f || Date.now() - f.ts > FIX_VIEJO_MS) return false;
    encolar({ lat: f.lat, lng: f.lng, precisionM: Math.round(f.precisionM), ts: Date.now() });
    return true;
  }, [encolar]);

  // --- Pantalla encendida ---
  const pedirPantalla = useCallback(async () => {
    const nav = navigator as ConWakeLock;
    if (!nav.wakeLock) {
      setPantalla(null);
      return;
    }
    try {
      const b = await nav.wakeLock.request("screen");
      bloqueo.current = b;
      setPantalla(true);
      b.addEventListener("release", () => setPantalla(false));
    } catch {
      setPantalla(false);
    }
  }, []);

  const empezar = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGps("error");
      return;
    }
    setActivo(true);
    setGps("buscando");
    void pedirPantalla();
    if (watchId.current === null) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const f: Fix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            precisionM: pos.coords.accuracy,
            ts: Date.now(),
          };
          const primero = fixRef.current === null;
          fixRef.current = f;
          setFix(f);
          setGps("ok");
          // El primer punto sale ya: que el desfile aparezca apenas se abre el panel.
          if (primero && encolarFix()) void vaciarCola();
        },
        (err) => setGps(err.code === err.PERMISSION_DENIED ? "denegado" : "error"),
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
      );
    }
  }, [encolarFix, pedirPantalla, vaciarCola]);

  const terminar = useCallback(() => {
    setActivo(false);
    setGps("apagado");
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    fixRef.current = null;
    setFix(null);
    void bloqueo.current?.release();
    bloqueo.current = null;
    setPantalla(false);
    // Lo que quede en cola se intenta mandar igual: es el final del recorrido.
    void vaciarCola();
  }, [vaciarCola]);

  // --- El latido: un punto cada INTERVALO_ENVIO_MS ---
  useEffect(() => {
    if (!activo) return;
    const t = setInterval(() => {
      encolarFix();
      void vaciarCola();
    }, INTERVALO_ENVIO_MS);
    return () => clearInterval(t);
  }, [activo, encolarFix, vaciarCola]);

  // Al volver a la app (pantalla desbloqueada) o recuperar la señal: mandar ya,
  // y volver a pedir la pantalla encendida, que el navegador suelta al ocultarse.
  useEffect(() => {
    if (!activo) return;
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      void pedirPantalla();
      void vaciarCola();
    };
    const alConectar = () => void vaciarCola();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alConectar);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alConectar);
    };
  }, [activo, pedirPantalla, vaciarCola]);

  useEffect(
    () => () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      void bloqueo.current?.release();
    },
    [],
  );

  const estoyAqui = useCallback(() => {
    const ok = encolarFix();
    if (ok) void vaciarCola();
    return ok;
  }, [encolarFix, vaciarCola]);

  const marcarHito = useCallback(
    (hitoId: string) => {
      encolar({ hitoId, ts: Date.now() });
      void vaciarCola();
    },
    [encolar, vaciarCola],
  );

  return {
    activo,
    gps,
    fix,
    red,
    ultimoEnvio,
    pendientes,
    pantallaEncendida,
    empezar,
    terminar,
    estoyAqui,
    marcarHito,
  };
}
