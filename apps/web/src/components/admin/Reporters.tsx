"use client";

import { useState } from "react";

import { api, SecondaryButton, POST_COLOR, POST_NAME, useReporters } from "@/components/admin/common";
import { timeAgo } from "@/lib/format";
import { useClock } from "@/lib/hooks/useParadeState";
import { POSTS, type Reporter, type Post } from "@/lib/types";

export function ReportersAdmin({ onExpired }: { onExpired: () => void }) {
  const { reporters, error, reload } = useReporters(onExpired);
  const now = useClock(30_000);
  const [name, setName] = useState("");
  const [post, setPost] = useState<Post>("head");
  const [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handle = (r: { ok: false; error: string; status: number }) => {
    if (r.status === 401) onExpired();
    setFormError(r.error);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api<{ reporter: Reporter; code: string }>("/api/admin/reporteros", {
      method: "POST",
      body: JSON.stringify({ name, post }),
    });
    if (!r.ok) return handle(r);
    setCode({ name: r.data.reporter.name, code: r.data.code });
    setName("");
    setFormError(null);
    void reload();
  };

  const change = async (reporter: Reporter, changes: Record<string, unknown>) => {
    const r = await api<{ reporter: Reporter; code: string | null }>(
      `/api/admin/reporteros/${reporter.id}`,
      { method: "PATCH", body: JSON.stringify(changes) },
    );
    if (!r.ok) return handle(r);
    if (r.data.code) setCode({ name: reporter.name, code: r.data.code });
    void reload();
  };

  const remove = async (reporter: Reporter) => {
    if (!confirm(`¿Borrar a ${reporter.name}? Su código deja de servir.`)) return;
    const r = await api(`/api/admin/reporteros/${reporter.id}`, { method: "DELETE" });
    if (!r.ok) return handle(r);
    void reload();
  };

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-[15px] font-extrabold text-ink">Agregar reportero</p>
        <p className="mt-1 text-[13px] text-ink-3">
          Cada persona entra en <b>/reporter</b> con su propio código. Conviene tener un suplente
          por rol: mientras el titular manda, el suplente queda de respaldo, y si el titular se
          calla un minuto, el suplente toma el rol solo.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            aria-label="Nombre"
            className="min-w-48 flex-1 rounded-xl border border-line-3 px-3 py-2.5 text-ink focus:border-ink focus:outline-none"
          />
          <select
            value={post}
            onChange={(e) => setPost(e.target.value as Post)}
            aria-label="Rol"
            className="rounded-xl border border-line-3 bg-white px-3 py-2.5 text-ink"
          >
            {POSTS.map((r) => (
              <option key={r} value={r}>
                {POST_NAME[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-full bg-ink px-5 py-2.5 font-bold text-paper disabled:opacity-40"
          >
            Crear y generar código
          </button>
        </div>
        {formError ?? error ? (
          <p className="mt-3 text-sm font-semibold text-alert">{formError ?? error}</p>
        ) : null}
      </form>

      {code ? (
        <div className="rounded-3xl border-2 border-ok bg-white p-5" role="status">
          <p className="text-[14px] font-bold text-ink">Código de {code.name}</p>
          <p className="mt-2 font-mono text-[34px] font-bold tracking-[0.15em] text-ink">
            {code.code}
          </p>
          <p className="mt-2 text-[13px] text-ink-2">
            Pasáselo ahora: <b>no se vuelve a mostrar</b>. Si se pierde, generá uno nuevo y el
            anterior deja de servir.
          </p>
          <div className="mt-3 flex gap-2">
            <SecondaryButton onClick={() => void navigator.clipboard?.writeText(code.code)}>
              Copiar
            </SecondaryButton>
            <SecondaryButton onClick={() => setCode(null)}>Listo, ya lo pasé</SecondaryButton>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
        {reporters === null ? (
          <p className="p-5 text-sm text-ink-3">Cargando…</p>
        ) : reporters.length === 0 ? (
          <p className="p-5 text-sm text-ink-3">Todavía no hay reporteros.</p>
        ) : (
          <ul className="divide-y divide-line">
            {reporters.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className={`size-3 shrink-0 rounded-full ${POST_COLOR[r.post]}`} aria-hidden />
                <div className="min-w-40 flex-1">
                  <p className={`font-bold ${r.active ? "text-ink" : "text-ink-4 line-through"}`}>
                    {r.name}
                  </p>
                  <p className="text-[13px] text-ink-3">
                    {r.lastSignalTs ? `última señal ${timeAgo(r.lastSignalTs, now)}` : "nunca ha reportado"}
                  </p>
                </div>
                <select
                  value={r.post}
                  onChange={(e) => void change(r, { post: e.target.value })}
                  aria-label={`Rol de ${r.name}`}
                  className="rounded-lg border border-line-3 bg-white px-2 py-1.5 text-[14px] text-ink"
                >
                  {POSTS.map((x) => (
                    <option key={x} value={x}>
                      {POST_NAME[x]}
                    </option>
                  ))}
                </select>
                <SecondaryButton onClick={() => void change(r, { active: !r.active })}>
                  {r.active ? "Desactivar" : "Activar"}
                </SecondaryButton>
                <SecondaryButton onClick={() => void change(r, { newCode: true })}>Nuevo código</SecondaryButton>
                <SecondaryButton danger onClick={() => void remove(r)}>
                  Borrar
                </SecondaryButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
