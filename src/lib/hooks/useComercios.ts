"use client";

import { useEffect, useState } from "react";

import type { Comercio } from "@/lib/tipos";

/**
 * Los comercios del mapa. Se piden una vez al abrir: cambian cuando el admin
 * los edita, no cada minuto. Sin red, el service worker devuelve la última copia.
 */
export function useComercios(activo: boolean): Comercio[] {
  const [comercios, setComercios] = useState<Comercio[]>([]);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    fetch("/api/comercios")
      .then((r) => (r.ok ? (r.json() as Promise<{ comercios: Comercio[] }>) : null))
      .then((d) => {
        if (vivo && d) setComercios(d.comercios);
      })
      .catch(() => {
        // Sin red y sin copia: la capa queda vacía, el resto del mapa sigue.
      });
    return () => {
      vivo = false;
    };
  }, [activo]);

  return comercios;
}
