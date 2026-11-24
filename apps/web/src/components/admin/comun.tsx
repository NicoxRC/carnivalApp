"use client";

import { useCallback, useEffect, useState } from "react";

import type { Reportero, Rol } from "@/lib/tipos";

/** Piezas compartidas por las pestañas del panel de administración. */

export const NOMBRE_ROL: Record<Rol, string> = { cabeza: "Cabeza", mitad: "Mitad", cola: "Cola" };
export const COLOR_ROL: Record<Rol, string> = { cabeza: "bg-cabeza", mitad: "bg-mitad", cola: "bg-cola" };

export const ENTRADA =
  "mt-1.5 w-full rounded-xl border border-borde-3 bg-blanco px-3 py-2.5 text-tinta focus:border-tinta focus:outline-none";

export type Respuesta<T> = { ok: true; datos: T } | { ok: false; error: string; status: number };

/** fetch con JSON, que devuelve el error del servidor en vez de lanzar. */
export async function api<T>(url: string, init?: RequestInit): Promise<Respuesta<T>> {
  try {
    const r = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const d = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) return { ok: false, error: d.error ?? `Error ${r.status}`, status: r.status };
    return { ok: true, datos: d };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", status: 0 };
  }
}

export function useReporteros(onVencida: () => void, cadaMs?: number) {
  const [reporteros, setReporteros] = useState<Reportero[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const r = await api<{ reporteros: Reportero[] }>("/api/admin/reporteros");
    if (r.ok) {
      setReporteros(r.datos.reporteros);
      setError(null);
    } else if (r.status === 401) onVencida();
    else setError(r.error);
  }, [onVencida]);

  useEffect(() => {
    void recargar();
    if (!cadaMs) return;
    const t = setInterval(recargar, cadaMs);
    return () => clearInterval(t);
  }, [recargar, cadaMs]);

  return { reporteros, error, recargar };
}

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-bold text-tinta">
      {etiqueta}
      {ayuda ? <span className="block text-[12px] font-normal text-tinta-3">{ayuda}</span> : null}
      {children}
    </label>
  );
}

export function BotonSec({
  children,
  onClick,
  peligro,
  activo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  peligro?: boolean;
  activo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${
        activo
          ? "border-tinta bg-tinta text-papel"
          : peligro
            ? "border-alerta/40 text-alerta"
            : "border-borde-3 text-tinta-2"
      } active:opacity-80`}
    >
      {children}
    </button>
  );
}

export function BotonPrimario({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-full bg-tinta px-5 py-2.5 font-bold text-papel disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export const TARJETA = "rounded-3xl bg-blanco p-5 shadow-sm";
