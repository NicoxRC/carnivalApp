"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  binDeMetros,
  INTERVALO_REPORTE_DENSIDAD_MS,
  type Densidad,
} from "@/lib/densidad";
import { obtenerDispositivo, olvidarDispositivo } from "@/lib/dispositivo";

const CLAVE_COMPARTIR = "sed:compartir-gentio";

export type PermisoCompartir = "sin_decidir" | "si" | "no";

function leerPreferencia(): PermisoCompartir {
  try {
    const v = localStorage.getItem(CLAVE_COMPARTIR);
    return v === "si" || v === "no" ? v : "sin_decidir";
  } catch {
    return "sin_decidir";
  }
}

interface Resultado {
  densidad: Densidad | null;
  compartir: PermisoCompartir;
  decidirCompartir: (valor: "si" | "no") => void;
}

/**
 * Gentío: leer siempre, aportar solo si la persona dijo que sí.
 *
 * Aportar es mandar el número de TRAMO de la senda cada minuto — nunca lat/lng,
 * nunca un historial. Aun así es dato de ubicación, así que no se activa solo:
 * hace falta una respuesta explícita.
 */
export function useDensidad(
  activo: boolean,
  metrosUsuario: number | null,
): Resultado {
  const [densidad, setDensidad] = useState<Densidad | null>(null);
  const [compartir, setCompartir] = useState<PermisoCompartir>("sin_decidir");
  const metros = useRef(metrosUsuario);
  metros.current = metrosUsuario;

  useEffect(() => {
    setCompartir(leerPreferencia());
  }, []);

  const decidirCompartir = useCallback((valor: "si" | "no") => {
    try {
      localStorage.setItem(CLAVE_COMPARTIR, valor);
    } catch {
      // vale para esta sesión
    }
    setCompartir(valor);
  }, []);

  // --- Leer ---
  useEffect(() => {
    if (!activo) return;
    let vivo = true;

    const leer = async () => {
      try {
        const r = await fetch("/api/densidad", { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as Densidad;
        if (vivo) setDensidad(d);
      } catch {
        // Sin red se conserva el último agregado conocido.
      }
    };

    void leer();
    // El gentío es un dato lento: no hace falta refrescarlo cada segundo.
    const t = setInterval(leer, 45_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [activo]);

  // --- Aportar ---
  useEffect(() => {
    if (compartir !== "si") return;

    const enviar = async () => {
      const m = metros.current;
      if (m === null) return;
      try {
        const dispositivo = await obtenerDispositivo();
        if (!dispositivo) return;
        const r = await fetch("/api/densidad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dispositivo, bin: binDeMetros(m) }),
        });
        if (r.status === 401) olvidarDispositivo();
      } catch {
        // Que no se pueda aportar no rompe nada: la capa se lee igual.
      }
    };

    void enviar();
    const t = setInterval(enviar, INTERVALO_REPORTE_DENSIDAD_MS);
    return () => clearInterval(t);
  }, [compartir]);

  return { densidad, compartir, decidirCompartir };
}
