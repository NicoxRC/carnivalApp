"use client";

import { useCallback, useEffect, useState } from "react";

import type { Reporter, Post } from "@/lib/types";

export const POST_NAME: Record<Post, string> = { head: "Cabeza", middle: "Mitad", tail: "Cola" };
export const POST_COLOR: Record<Post, string> = { head: "bg-head", middle: "bg-middle", tail: "bg-tail" };

export const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-line-3 bg-white px-3 py-2.5 text-ink focus:border-ink focus:outline-none";

export type Answer<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function api<T>(url: string, init?: RequestInit): Promise<Answer<T>> {
  try {
    const r = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const d = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) return { ok: false, error: d.error ?? `Error ${r.status}`, status: r.status };
    return { ok: true, data: d };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", status: 0 };
  }
}

export function useReporters(onExpired: () => void, everyMs?: number) {
  const [reporters, setReporters] = useState<Reporter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api<{ reporters: Reporter[] }>("/api/admin/reporteros");
    if (r.ok) {
      setReporters(r.data.reporters);
      setError(null);
    } else if (r.status === 401) onExpired();
    else setError(r.error);
  }, [onExpired]);

  useEffect(() => {
    void reload();
    if (!everyMs) return;
    const t = setInterval(reload, everyMs);
    return () => clearInterval(t);
  }, [reload, everyMs]);

  return { reporters, error, reload };
}

export function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-bold text-ink">
      {label}
      {help ? <span className="block text-[12px] font-normal text-ink-3">{help}</span> : null}
      {children}
    </label>
  );
}

export function SecondaryButton({
  children,
  onClick,
  danger,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${
        active
          ? "border-ink bg-ink text-paper"
          : danger
            ? "border-alert/40 text-alert"
            : "border-line-3 text-ink-2"
      } active:opacity-80`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="rounded-full bg-ink px-5 py-2.5 font-bold text-paper disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export const CARD_CLASS = "rounded-3xl bg-white p-5 shadow-sm";
