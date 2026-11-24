"use client";

import { useEffect, useState } from "react";

import type { Desfile, Evento } from "@/lib/tipos";

export interface Programacion {
  desfiles: Desfile[];
  eventos: Evento[];
  /** YYYY-MM-DD de hoy en Pasto, según el servidor. */
  hoy: string;
  actualId: string | null;
}

/** La programación completa. Cambia poco: se pide al abrir y al volver a la app. */
export function useProgramacion(): Programacion | null {
  const [p, setP] = useState<Programacion | null>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () =>
      fetch("/api/programacion")
        .then((r) => (r.ok ? (r.json() as Promise<Programacion>) : null))
        .then((d) => {
          if (vivo && d) setP(d);
        })
        .catch(() => {
          // Sin red: el service worker devuelve la última copia, o queda lo que había.
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
