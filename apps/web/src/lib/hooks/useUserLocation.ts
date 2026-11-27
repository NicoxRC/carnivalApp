"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MAX_USER_OFFSET_M, projectOnCourse, type Projection } from "@/lib/course";

export type LocationPermission = "unknown" | "asking" | "granted" | "denied" | "error";

export interface UserLocation {
  lat: number;
  lng: number;
  accuracyM: number | null;
  ts: number;
  projection: Projection;
  manual: boolean;
}

interface Result {
  location: UserLocation | null;
  permission: LocationPermission;
  errorMessage: string | null;
  offCourse: boolean;
  request: () => void;
  setManual: (lat: number, lng: number) => void;
  clearManual: () => void;
}

const MANUAL_KEY = "sed:ubicacion-manual";

export function useUserLocation(): Result {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [permission, setPermission] = useState<LocationPermission>("unknown");
  const [errorMessage, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const hasManual = useRef(false);

  const build = useCallback(
    (lat: number, lng: number, accuracyM: number | null, manual: boolean): UserLocation => ({
      lat,
      lng,
      accuracyM,
      ts: Date.now(),
      projection: projectOnCourse(lat, lng),
      manual,
    }),
    [],
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MANUAL_KEY);
      if (!saved) return;
      const { lat, lng } = JSON.parse(saved) as { lat: number; lng: number };
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        hasManual.current = true;
        setLocation(build(lat, lng, null, true));
        setPermission("granted");
      }
    } catch {}
  }, [build]);

  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setPermission("error");
      setError("Este navegador no permite compartir la ubicación.");
      return;
    }
    if (watchId.current !== null) return;

    setPermission("asking");
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (hasManual.current) return;
        setPermission("granted");
        setError(null);
        setLocation(build(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermission("denied");
          setError("No diste permiso de ubicación. Puedes marcar tu punto en el mapa.");
        } else {
          setPermission("error");
          setError("No se pudo leer el GPS. Puedes marcar tu punto en el mapa.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
  }, [build]);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  const setManual = useCallback(
    (lat: number, lng: number) => {
      hasManual.current = true;
      setLocation(build(lat, lng, null, true));
      setPermission("granted");
      setError(null);
      try {
        localStorage.setItem(MANUAL_KEY, JSON.stringify({ lat, lng }));
      } catch {}
    },
    [build],
  );

  const clearManual = useCallback(() => {
    hasManual.current = false;
    setLocation(null);
    try {
      localStorage.removeItem(MANUAL_KEY);
    } catch {}
    request();
  }, [request]);

  return {
    location,
    permission,
    errorMessage,
    offCourse: location !== null && location.projection.offsetM > MAX_USER_OFFSET_M,
    request,
    setManual,
    clearManual,
  };
}
