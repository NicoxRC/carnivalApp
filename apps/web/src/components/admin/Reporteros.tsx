"use client";

import { useState } from "react";

import { api, BotonSec, COLOR_ROL, NOMBRE_ROL, useReporteros } from "@/components/admin/comun";
import { haceCuanto } from "@/lib/formato";
import { useReloj } from "@/lib/hooks/useEstadoDesfile";
import { ROLES, type Reportero, type Rol } from "@/lib/tipos";

/* ------------------------------- Reporteros ------------------------------- */

export function Reporteros({ onVencida }: { onVencida: () => void }) {
  const { reporteros, error, recargar } = useReporteros(onVencida);
  const ahora = useReloj(30_000);
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("cabeza");
  const [codigo, setCodigo] = useState<{ nombre: string; codigo: string } | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  const manejar = (r: { ok: false; error: string; status: number }) => {
    if (r.status === 401) onVencida();
    setErrorForm(r.error);
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api<{ reportero: Reportero; codigo: string }>("/api/admin/reporteros", {
      method: "POST",
      body: JSON.stringify({ nombre, rol }),
    });
    if (!r.ok) return manejar(r);
    setCodigo({ nombre: r.datos.reportero.nombre, codigo: r.datos.codigo });
    setNombre("");
    setErrorForm(null);
    void recargar();
  };

  const cambiar = async (rep: Reportero, cambios: Record<string, unknown>) => {
    const r = await api<{ reportero: Reportero; codigo: string | null }>(
      `/api/admin/reporteros/${rep.id}`,
      { method: "PATCH", body: JSON.stringify(cambios) },
    );
    if (!r.ok) return manejar(r);
    if (r.datos.codigo) setCodigo({ nombre: rep.nombre, codigo: r.datos.codigo });
    void recargar();
  };

  const borrar = async (rep: Reportero) => {
    if (!confirm(`¿Borrar a ${rep.nombre}? Su código deja de servir.`)) return;
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
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre"
            aria-label="Nombre"
            className="min-w-48 flex-1 rounded-xl border border-borde-3 px-3 py-2.5 text-tinta focus:border-tinta focus:outline-none"
          />
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
            aria-label="Rol"
            className="rounded-xl border border-borde-3 bg-blanco px-3 py-2.5 text-tinta"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_ROL[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!nombre.trim()}
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
          <p className="text-[14px] font-bold text-tinta">Código de {codigo.nombre}</p>
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
                <span className={`size-3 shrink-0 rounded-full ${COLOR_ROL[r.rol]}`} aria-hidden />
                <div className="min-w-40 flex-1">
                  <p className={`font-bold ${r.activo ? "text-tinta" : "text-tinta-4 line-through"}`}>
                    {r.nombre}
                  </p>
                  <p className="text-[13px] text-tinta-3">
                    {r.ultimaSenalTs ? `última señal ${haceCuanto(r.ultimaSenalTs, ahora)}` : "nunca ha reportado"}
                  </p>
                </div>
                <select
                  value={r.rol}
                  onChange={(e) => void cambiar(r, { rol: e.target.value })}
                  aria-label={`Rol de ${r.nombre}`}
                  className="rounded-lg border border-borde-3 bg-blanco px-2 py-1.5 text-[14px] text-tinta"
                >
                  {ROLES.map((x) => (
                    <option key={x} value={x}>
                      {NOMBRE_ROL[x]}
                    </option>
                  ))}
                </select>
                <BotonSec onClick={() => void cambiar(r, { activo: !r.activo })}>
                  {r.activo ? "Desactivar" : "Activar"}
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
