"use client";

import { useCallback, useEffect, useState } from "react";

import { api, CARD_CLASS, failureText, SecondaryButton } from "@/components/admin/common";
import { API_BASE } from "@/lib/api/client";
import { parsePhotos } from "@/lib/api/photos";
import { readToken } from "@/lib/session";
import { nearestWaypoint } from "@/lib/course";
import type { Photo } from "@/lib/types";

export function PhotosAdmin({ onExpired }: { onExpired: () => void }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await api<unknown>("/api/admin/photos");
    if (r.ok) {
      try {
        setPhotos(parsePhotos(r.data));
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Respuesta inválida.");
      }
    } else if (r.status === 401) onExpired();
    else setError(failureText(r));
  }, [onExpired]);

  useEffect(() => {
    void reload();
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload]);

  const moderate = async (f: Photo, state: Photo["state"]) => {
    const r = await api(`/api/admin/photos/${encodeURIComponent(f.id)}`, { method: "PATCH", body: JSON.stringify({ state }) });
    if (!r.ok) setError(failureText(r));
    void reload();
  };

  const remove = async (f: Photo) => {
    if (!confirm("¿Borrar esta foto para siempre?")) return;
    const r = await api(`/api/admin/photos/${encodeURIComponent(f.id)}`, { method: "DELETE" });
    if (!r.ok) setError(failureText(r));
    void reload();
  };

  const group = (state: Photo["state"]) => (photos ?? []).filter((f) => f.state === state);

  const Grid = ({ list, actions }: { list: Photo[]; actions: (f: Photo) => React.ReactNode }) => (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {list.map((f) => (
        <figure key={f.id} className="overflow-hidden rounded-2xl border border-line-2 bg-white">
          <PrivateImage url={f.url} />
          <figcaption className="space-y-2 p-2.5">
            <p className="text-[12px] text-ink-3">
              {new Date(f.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" })}
              {f.metres !== null ? ` · por ${nearestWaypoint(f.metres)?.short ?? "la senda"}` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">{actions(f)}</div>
          </figcaption>
        </figure>
      ))}
    </div>
  );

  if (photos === null) return <p className="text-sm text-ink-3">Cargando…</p>;

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm font-semibold text-alert">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="display-font text-[20px] text-ink">Por revisar ({group("pending").length})</h2>
        {group("pending").length === 0 ? (
          <p className={`${CARD_CLASS} text-sm text-ink-3`}>No hay fotos esperando.</p>
        ) : (
          <Grid
            list={group("pending")}
            actions={(f) => (
              <>
                <SecondaryButton active onClick={() => void moderate(f, "approved")}>
                  Aprobar
                </SecondaryButton>
                <SecondaryButton danger onClick={() => void moderate(f, "rejected")}>
                  Rechazar
                </SecondaryButton>
              </>
            )}
          />
        )}
      </section>

      {group("approved").length > 0 && (
        <section className="space-y-3">
          <h2 className="display-font text-[20px] text-ink">Publicadas ({group("approved").length})</h2>
          <Grid
            list={group("approved")}
            actions={(f) => <SecondaryButton onClick={() => void moderate(f, "rejected")}>Quitar del muro</SecondaryButton>}
          />
        </section>
      )}

      {group("rejected").length > 0 && (
        <section className="space-y-3">
          <h2 className="display-font text-[20px] text-ink">Rechazadas ({group("rejected").length})</h2>
          <Grid
            list={group("rejected")}
            actions={(f) => (
              <>
                <SecondaryButton onClick={() => void moderate(f, "approved")}>Aprobar</SecondaryButton>
                <SecondaryButton danger onClick={() => void remove(f)}>
                  Borrar
                </SecondaryButton>
              </>
            )}
          />
        </section>
      )}
    </div>
  );
}

function PrivateImage({ url }: { url: string }) {
  const fromApi = API_BASE !== null && url.startsWith(API_BASE);
  const [src, setSrc] = useState<string | null>(fromApi ? null : url);

  useEffect(() => {
    if (!fromApi) return setSrc(url);
    let objectUrl: string | null = null;
    let alive = true;
    const token = readToken();
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob || !alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, fromApi]);

  if (!src) return <div className="aspect-square w-full bg-paper-2" />;
  // eslint-disable-next-line @next/next/no-img-element -- a private image: a signed bucket URL, or fetched from the API with the session
  return <img src={src} alt="" loading="lazy" className="aspect-square w-full object-cover" />;
}
