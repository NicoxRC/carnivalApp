"use client";

import { useEffect, useState } from "react";

import { pedirApi } from "@/lib/api/cliente";
import { comerciosDesdeApi } from "@/lib/api/comercios";
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
    pedirApi("/api/businesses")
      .then((r) => r.json())
      .then((json) => {
        if (vivo) setComercios(comerciosDesdeApi(json));
      })
      .catch((error: unknown) => {
        // Sin red y sin copia: la capa queda vacía, el resto del mapa sigue.
        if (!(error instanceof TypeError)) console.warn("No se pudieron leer los comercios:", error);
      });
    return () => {
      vivo = false;
    };
  }, [activo]);

  return comercios;
}
