"use client";

import { useCallback, useEffect, useState } from "react";

import { api, BotonSec, TARJETA } from "@/components/admin/comun";
import { hitoMasCercano } from "@/lib/senda";
import type { Foto } from "@/lib/tipos";

/**
 * Moderación. Nada de lo que sube el público sale en el muro sin pasar por
 * aquí. Primero las pendientes, que son las que esperan decisión.
 */
export function Fotos({ onVencida }: { onVencida: () => void }) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const r = await api<{ fotos: Foto[] }>("/api/admin/fotos");
    if (r.ok) setFotos(r.datos.fotos);
    else if (r.status === 401) onVencida();
    else setError(r.error);
  }, [onVencida]);

  useEffect(() => {
    void recargar();
    const t = setInterval(recargar, 30_000);
    return () => clearInterval(t);
  }, [recargar]);

  const moderar = async (f: Foto, estado: Foto["estado"]) => {
    const r = await api(`/api/admin/fotos/${f.id}`, { method: "PATCH", body: JSON.stringify({ estado }) });
    if (!r.ok) setError(r.error);
    void recargar();
  };

  const borrar = async (f: Foto) => {
    if (!confirm("¿Borrar esta foto para siempre?")) return;
    const r = await api(`/api/admin/fotos/${f.id}`, { method: "DELETE" });
    if (!r.ok) setError(r.error);
    void recargar();
  };

  const grupo = (estado: Foto["estado"]) => (fotos ?? []).filter((f) => f.estado === estado);

  const Rejilla = ({ lista, acciones }: { lista: Foto[]; acciones: (f: Foto) => React.ReactNode }) => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {lista.map((f) => (
        <figure key={f.id} className="overflow-hidden rounded-2xl border border-borde-2 bg-blanco">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API */}
          <img src={f.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
          <figcaption className="space-y-2 p-2.5">
            <p className="text-[12px] text-tinta-3">
              {new Date(f.creadoEn).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}
              {f.metros !== null ? ` · por ${hitoMasCercano(f.metros)?.corto ?? "la senda"}` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">{acciones(f)}</div>
          </figcaption>
        </figure>
      ))}
    </div>
  );

  if (fotos === null) return <p className="text-sm text-tinta-3">Cargando…</p>;

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm font-semibold text-alerta">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="fuente-display text-[20px] text-tinta">Por revisar ({grupo("pendiente").length})</h2>
        {grupo("pendiente").length === 0 ? (
          <p className={`${TARJETA} text-sm text-tinta-3`}>No hay fotos esperando.</p>
        ) : (
          <Rejilla
            lista={grupo("pendiente")}
            acciones={(f) => (
              <>
                <BotonSec activo onClick={() => void moderar(f, "aprobada")}>
                  Aprobar
                </BotonSec>
                <BotonSec peligro onClick={() => void moderar(f, "rechazada")}>
                  Rechazar
                </BotonSec>
              </>
            )}
          />
        )}
      </section>

      {grupo("aprobada").length > 0 && (
        <section className="space-y-3">
          <h2 className="fuente-display text-[20px] text-tinta">Publicadas ({grupo("aprobada").length})</h2>
          <Rejilla
            lista={grupo("aprobada")}
            acciones={(f) => <BotonSec onClick={() => void moderar(f, "rechazada")}>Quitar del muro</BotonSec>}
          />
        </section>
      )}

      {grupo("rechazada").length > 0 && (
        <section className="space-y-3">
          <h2 className="fuente-display text-[20px] text-tinta">Rechazadas ({grupo("rechazada").length})</h2>
          <Rejilla
            lista={grupo("rechazada")}
            acciones={(f) => (
              <>
                <BotonSec onClick={() => void moderar(f, "aprobada")}>Aprobar</BotonSec>
                <BotonSec peligro onClick={() => void borrar(f)}>
                  Borrar
                </BotonSec>
              </>
            )}
          />
        </section>
      )}
    </div>
  );
}
