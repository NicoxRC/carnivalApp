"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DESVIO_MAX_USUARIO_M, metrosEnSenda, type Proyeccion } from "@/lib/senda";

export type PermisoUbicacion = "desconocido" | "pidiendo" | "concedido" | "denegado" | "error";

export interface Ubicacion {
  lat: number;
  lng: number;
  precisionM: number | null;
  ts: number;
  /** El usuario proyectado sobre la senda: el número que usa el ETA. */
  proyeccion: Proyeccion;
  /** true si eligió el punto a mano en vez de usar el GPS. */
  manual: boolean;
}

interface Resultado {
  ubicacion: Ubicacion | null;
  permiso: PermisoUbicacion;
  mensajeError: string | null;
  /** Está lejos de la senda: el ETA no significaría nada. */
  fueraDeSenda: boolean;
  pedir: () => void;
  fijarManual: (lat: number, lng: number) => void;
  limpiarManual: () => void;
}

const CLAVE_MANUAL = "sed:ubicacion-manual";

/**
 * Ubicación del usuario. Se proyecta sobre la senda apenas llega, porque
 * a partir de ahí todo el producto trabaja con un solo número: metros.
 */
export function useUbicacion(): Resultado {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [permiso, setPermiso] = useState<PermisoUbicacion>("desconocido");
  const [mensajeError, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const hayManual = useRef(false);

  const construir = useCallback(
    (lat: number, lng: number, precisionM: number | null, manual: boolean): Ubicacion => ({
      lat,
      lng,
      precisionM,
      ts: Date.now(),
      proyeccion: metrosEnSenda(lat, lng),
      manual,
    }),
    [],
  );

  // Si en una sesión anterior fijó el punto a mano, se respeta: seguramente
  // lo hizo porque el GPS no le funciona.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_MANUAL);
      if (!guardado) return;
      const { lat, lng } = JSON.parse(guardado) as { lat: number; lng: number };
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        hayManual.current = true;
        setUbicacion(construir(lat, lng, null, true));
        setPermiso("concedido");
      }
    } catch {
      // localStorage bloqueado (modo privado): se sigue sin punto guardado.
    }
  }, [construir]);

  const pedir = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setPermiso("error");
      setError("Este navegador no permite compartir la ubicación.");
      return;
    }
    if (watchId.current !== null) return;

    setPermiso("pidiendo");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        // Un punto manual gana sobre el GPS hasta que el usuario lo borre.
        if (hayManual.current) return;
        setPermiso("concedido");
        setError(null);
        setUbicacion(construir(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermiso("denegado");
          setError("No diste permiso de ubicación. Puedes marcar tu punto en el mapa.");
        } else {
          setPermiso("error");
          setError("No se pudo leer el GPS. Puedes marcar tu punto en el mapa.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
  }, [construir]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  const fijarManual = useCallback(
    (lat: number, lng: number) => {
      hayManual.current = true;
      setUbicacion(construir(lat, lng, null, true));
      setPermiso("concedido");
      setError(null);
      try {
        localStorage.setItem(CLAVE_MANUAL, JSON.stringify({ lat, lng }));
      } catch {
        // Sin persistencia: el punto vale igual para esta sesión.
      }
    },
    [construir],
  );

  const limpiarManual = useCallback(() => {
    hayManual.current = false;
    setUbicacion(null);
    try {
      localStorage.removeItem(CLAVE_MANUAL);
    } catch {
      // nada
    }
    pedir();
  }, [pedir]);

  return {
    ubicacion,
    permiso,
    mensajeError,
    fueraDeSenda: ubicacion !== null && ubicacion.proyeccion.desvioM > DESVIO_MAX_USUARIO_M,
    pedir,
    fijarManual,
    limpiarManual,
  };
}
