"use client";

import { useCallback, useEffect, useState } from "react";

import { apiUrl } from "@/lib/api/client";
import { clearSession, readToken } from "@/lib/session";
import { parseTeam } from "@/lib/api/admin";
import type { Post, TeamUser } from "@/lib/types";

export const POST_NAME: Record<Post, string> = { head: "Cabeza", middle: "Mitad", tail: "Cola" };
export const POST_COLOR: Record<Post, string> = { head: "bg-head", middle: "bg-middle", tail: "bg-tail" };

export const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-line-3 bg-white px-3 py-2.5 text-ink focus:border-ink focus:outline-none";

export type Answer<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function api<T>(url: string, init?: RequestInit): Promise<Answer<T>> {
  try {
    const token = readToken();
    const r = await fetch(apiUrl(url), {
      cache: "no-store",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
    const d = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (r.status === 401) clearSession();
    if (!r.ok) return { ok: false, error: d.error ?? `Error ${r.status}`, status: r.status };
    return { ok: true, data: d };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", status: 0 };
  }
}

export function useTeam(onExpired: () => void, everyMs?: number, enabled = true) {
  const [team, setTeam] = useState<TeamUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const r = await api<unknown>("/api/admin/users");
    if (r.ok) {
      try {
        setTeam(parseTeam(r.data));
        setError(null);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Respuesta inválida.");
      }
    } else if (r.status === 401) onExpired();
    else setError(r.error);
  }, [onExpired, enabled]);

  useEffect(() => {
    void reload();
    if (!everyMs) return;
    const t = setInterval(reload, everyMs);
    return () => clearInterval(t);
  }, [reload, everyMs]);

  return { team, error, reload };
}

export function slugId(name: string, taken: Iterable<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34)
      .replace(/-+$/, "") || "item";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

export type Can = (permission: string) => boolean;

export function failureText(r: { status: number; error: string }): string {
  return r.status === 403 ? "No tenés permiso para esto." : r.error;
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
