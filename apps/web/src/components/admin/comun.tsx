"use client";

import { useCallback, useEffect, useState } from "react";

import type { Reporter, Post } from "@/lib/types";

/** Piezas compartidas por las pestañas del panel de administración. */

export const NOMBRE_ROL: Record<Post, string> = { head: "Cabeza", middle: "Mitad", tail: "Cola" };
export const COLOR_ROL: Record<Post, string> = { head: "bg-cabeza", middle: "bg-mitad", tail: "bg-cola" };

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
  const [reporteros, setReporteros] = useState<Reporter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const r = await api<{ reporteros: Reporter[] }>("/api/admin/reporteros");
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
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  peligro?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${
        active
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
