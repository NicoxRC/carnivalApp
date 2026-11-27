"use client";

import { useCallback, useEffect, useState } from "react";

import { api, BotonSec, TARJETA } from "@/components/admin/comun";
import { nearestWaypoint } from "@/lib/course";
import type { Photo } from "@/lib/types";

/**
 * Moderación. Nada de lo que sube el público sale en el muro sin pasar por
 * aquí. Primero las pendientes, que son las que esperan decisión.
 */
export function Fotos({ onVencida }: { onVencida: () => void }) {
  const [fotos, setFotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const r = await api<{ fotos: Photo[] }>("/api/admin/fotos");
    if (r.ok) setFotos(r.datos.fotos);
    else if (r.status === 401) onVencida();
    else setError(r.error);
  }, [onVencida]);

  useEffect(() => {
    void recargar();
    const t = setInterval(recargar, 30_000);
    return () => clearInterval(t);
  }, [recargar]);

  const moderar = async (f: Photo, state: Photo["state"]) => {
    const r = await api(`/api/admin/fotos/${f.id}`, { method: "PATCH", body: JSON.stringify({ state }) });
    if (!r.ok) setError(r.error);
    void recargar();
  };

  const borrar = async (f: Photo) => {
    if (!confirm("¿Borrar esta foto para siempre?")) return;
    const r = await api(`/api/admin/fotos/${f.id}`, { method: "DELETE" });
    if (!r.ok) setError(r.error);
    void recargar();
  };

  const grupo = (state: Photo["state"]) => (fotos ?? []).filter((f) => f.state === state);

  const Rejilla = ({ list, acciones }: { list: Photo[]; acciones: (f: Photo) => React.ReactNode }) => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {list.map((f) => (
        <figure key={f.id} className="overflow-hidden rounded-2xl border border-borde-2 bg-blanco">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API */}
          <img src={f.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
          <figcaption className="space-y-2 p-2.5">
            <p className="text-[12px] text-tinta-3">
              {new Date(f.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}
              {f.metres !== null ? ` · por ${nearestWaypoint(f.metres)?.short ?? "la senda"}` : ""}
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
        <h2 className="fuente-display text-[20px] text-tinta">Por revisar ({grupo("pending").length})</h2>
        {grupo("pending").length === 0 ? (
          <p className={`${TARJETA} text-sm text-tinta-3`}>No hay fotos esperando.</p>
        ) : (
          <Rejilla
            list={grupo("pending")}
            acciones={(f) => (
              <>
                <BotonSec active onClick={() => void moderar(f, "approved")}>
                  Aprobar
                </BotonSec>
                <BotonSec peligro onClick={() => void moderar(f, "rejected")}>
                  Rechazar
                </BotonSec>
              </>
            )}
          />
        )}
      </section>

      {grupo("approved").length > 0 && (
        <section className="space-y-3">
          <h2 className="fuente-display text-[20px] text-tinta">Publicadas ({grupo("approved").length})</h2>
          <Rejilla
            list={grupo("approved")}
            acciones={(f) => <BotonSec onClick={() => void moderar(f, "rejected")}>Quitar del muro</BotonSec>}
          />
        </section>
      )}

      {grupo("rejected").length > 0 && (
        <section className="space-y-3">
          <h2 className="fuente-display text-[20px] text-tinta">Rechazadas ({grupo("rejected").length})</h2>
          <Rejilla
            list={grupo("rejected")}
            acciones={(f) => (
              <>
                <BotonSec onClick={() => void moderar(f, "approved")}>Aprobar</BotonSec>
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
