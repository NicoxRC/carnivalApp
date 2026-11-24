"use client";

import { useEffect, useState } from "react";

import { pedirApi } from "@/lib/api/cliente";
import { programacionDesdeApi, type Programacion } from "@/lib/api/programacion";

/** La programación completa. Cambia poco: se pide al abrir y al volver a la app. */
export function useProgramacion(): Programacion | null {
  const [p, setP] = useState<Programacion | null>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () =>
      pedirApi("/api/schedule")
        .then((r) => r.json())
        .then((json) => {
          if (vivo) setP(programacionDesdeApi(json));
        })
        .catch((error: unknown) => {
          // Sin red: el service worker devuelve la última copia, o queda lo que había.
          if (!(error instanceof TypeError)) console.warn("No se pudo leer la programación:", error);
        });
    void leer();
    const alVolver = () => {
      if (document.visibilityState === "visible") void leer();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  return p;
}
