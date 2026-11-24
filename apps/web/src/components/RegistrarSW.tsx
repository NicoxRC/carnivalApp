"use client";

import { useEffect } from "react";

import { BASE_API } from "@/lib/api/cliente";

/**
 * El service worker es lo que hace que la app abra el 31 de diciembre
 * con la celda saturada: cachea el armazón y la senda.
 *
 * Recibe el origen del API en la URL (`/sw.js?api=…`): es un archivo estático
 * y no puede leer variables de entorno, y sin ese origen no sabría qué
 * respuestas del backend guardar para abrir sin red.
 */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const t = setTimeout(() => {
      const api = BASE_API ? `?api=${encodeURIComponent(new URL(BASE_API).origin)}` : "";
      navigator.serviceWorker.register(`/sw.js${api}`).catch(() => {
        // Sin SW la app funciona igual, solo pierde el modo offline.
      });
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return null;
}
