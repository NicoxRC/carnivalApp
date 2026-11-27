"use client";

import { useState } from "react";

import { api, BotonSec, COLOR_ROL, NOMBRE_ROL, useReporteros } from "@/components/admin/comun";
import { timeAgo } from "@/lib/format";
import { useClock } from "@/lib/hooks/useParadeState";
import { POSTS, type Reporter, type Post } from "@/lib/types";

/* ------------------------------- Reporteros ------------------------------- */

export function Reporteros({ onVencida }: { onVencida: () => void }) {
  const { reporteros, error, recargar } = useReporteros(onVencida);
  const now = useClock(30_000);
  const [name, setNombre] = useState("");
  const [post, setRol] = useState<Post>("head");
  const [codigo, setCodigo] = useState<{ name: string; codigo: string } | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const manejar = (r: { ok: false; error: string; status: number }) => {
    if (r.status === 401) onVencida();
    setErrorForm(r.error);
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api<{ reportero: Reporter; codigo: string }>("/api/admin/reporteros", {
      method: "POST",
      body: JSON.stringify({ name, post }),
    });
    if (!r.ok) return manejar(r);
    setCodigo({ name: r.datos.reportero.name, codigo: r.datos.codigo });
    setNombre("");
    setErrorForm(null);
    void recargar();
  };

  const cambiar = async (rep: Reporter, cambios: Record<string, unknown>) => {
    const r = await api<{ reportero: Reporter; codigo: string | null }>(
      `/api/admin/reporteros/${rep.id}`,
      { method: "PATCH", body: JSON.stringify(cambios) },
    );
    if (!r.ok) return manejar(r);
    if (r.datos.codigo) setCodigo({ name: rep.name, codigo: r.datos.codigo });
    void recargar();
  };

  const borrar = async (rep: Reporter) => {
    if (!confirm(`¿Borrar a ${rep.name}? Su código deja de servir.`)) return;
    const r = await api(`/api/admin/reporteros/${rep.id}`, { method: "DELETE" });
    if (!r.ok) return manejar(r);
    void recargar();
  };

  return (
    <div className="space-y-5">
      <form onSubmit={crear} className="rounded-3xl bg-blanco p-5 shadow-sm">
        <p className="text-[15px] font-extrabold text-tinta">Agregar reportero</p>
        <p className="mt-1 text-[13px] text-tinta-3">
          Cada persona entra en <b>/reportero</b> con su propio código. Conviene tener un suplente
          por rol: mientras el titular manda, el suplente queda de respaldo, y si el titular se
          calla un minuto, el suplente toma el rol solo.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            aria-label="Nombre"
            className="min-w-48 flex-1 rounded-xl border border-borde-3 px-3 py-2.5 text-tinta focus:border-tinta focus:outline-none"
          />
          <select
            value={post}
            onChange={(e) => setRol(e.target.value as Post)}
            aria-label="Rol"
            className="rounded-xl border border-borde-3 bg-blanco px-3 py-2.5 text-tinta"
          >
            {POSTS.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_ROL[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-full bg-tinta px-5 py-2.5 font-bold text-papel disabled:opacity-40"
          >
            Crear y generar código
          </button>
        </div>
        {errorForm ?? error ? (
          <p className="mt-3 text-sm font-semibold text-alerta">{errorForm ?? error}</p>
        ) : null}
      </form>

      {codigo ? (
        <div className="rounded-3xl border-2 border-ok bg-blanco p-5" role="status">
          <p className="text-[14px] font-bold text-tinta">Código de {codigo.name}</p>
          <p className="mt-2 font-mono text-[34px] font-bold tracking-[0.15em] text-tinta">
            {codigo.codigo}
          </p>
          <p className="mt-2 text-[13px] text-tinta-2">
            Pasáselo ahora: <b>no se vuelve a mostrar</b>. Si se pierde, generá uno nuevo y el
            anterior deja de servir.
          </p>
          <div className="mt-3 flex gap-2">
            <BotonSec onClick={() => void navigator.clipboard?.writeText(codigo.codigo)}>
              Copiar
            </BotonSec>
            <BotonSec onClick={() => setCodigo(null)}>Listo, ya lo pasé</BotonSec>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl bg-blanco shadow-sm">
        {reporteros === null ? (
          <p className="p-5 text-sm text-tinta-3">Cargando…</p>
        ) : reporteros.length === 0 ? (
          <p className="p-5 text-sm text-tinta-3">Todavía no hay reporteros.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {reporteros.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className={`size-3 shrink-0 rounded-full ${COLOR_ROL[r.post]}`} aria-hidden />
                <div className="min-w-40 flex-1">
                  <p className={`font-bold ${r.active ? "text-tinta" : "text-tinta-4 line-through"}`}>
                    {r.name}
                  </p>
                  <p className="text-[13px] text-tinta-3">
                    {r.lastSignalTs ? `última señal ${timeAgo(r.lastSignalTs, now)}` : "nunca ha reportado"}
                  </p>
                </div>
                <select
                  value={r.post}
                  onChange={(e) => void cambiar(r, { post: e.target.value })}
                  aria-label={`Rol de ${r.name}`}
                  className="rounded-lg border border-borde-3 bg-blanco px-2 py-1.5 text-[14px] text-tinta"
                >
                  {POSTS.map((x) => (
                    <option key={x} value={x}>
                      {NOMBRE_ROL[x]}
                    </option>
                  ))}
                </select>
                <BotonSec onClick={() => void cambiar(r, { active: !r.active })}>
                  {r.active ? "Desactivar" : "Activar"}
                </BotonSec>
                <BotonSec onClick={() => void cambiar(r, { nuevoCodigo: true })}>Nuevo código</BotonSec>
                <BotonSec peligro onClick={() => void borrar(r)}>
                  Borrar
                </BotonSec>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
