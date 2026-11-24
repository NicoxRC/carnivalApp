"use client";

import { useEffect } from "react";

/**
 * El service worker es lo que hace que la app abra el 31 de diciembre
 * con la celda saturada: cachea el armazón y la senda.
 */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const t = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sin SW la app funciona igual, solo pierde el modo offline.
      });
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  return null;
}
