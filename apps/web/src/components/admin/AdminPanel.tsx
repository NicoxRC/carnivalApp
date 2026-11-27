"use client";

import { useCallback, useEffect, useState } from "react";

import { BusinessesAdmin } from "@/components/admin/Businesses";
import { api } from "@/components/admin/common";
import { LiveAdmin } from "@/components/admin/Live";
import { PhotosAdmin } from "@/components/admin/Photos";
import { Schedule } from "@/components/admin/Schedule";
import { ReportersAdmin } from "@/components/admin/Reporters";

const TABS_ADMIN = [
  ["live", "En vivo"],
  ["schedule", "Programación"],
  ["reporters", "Reporteros"],
  ["businesses", "Comercios"],
  ["photos", "Fotos"],
] as const;

type Tab = (typeof TABS_ADMIN)[number][0];

export function AdminPanel() {
  const [session, setSession] = useState<"loading" | "out" | "in">("loading");
  const [configured, setConfigured] = useState(true);
  const [tab, setTab] = useState<Tab>("live");

  useEffect(() => {
    void api<{ admin: boolean; configured: boolean }>("/api/admin/sesion").then((r) => {
      if (r.ok) {
        setConfigured(r.data.configured);
        setSession(r.data.admin ? "in" : "out");
      } else setSession("out");
    });
  }, []);

  const expired = useCallback(() => setSession("out"), []);

  if (session === "loading") return <p className="p-8 text-sm text-ink-3">Cargando…</p>;
  if (session === "out") return <LogIn configured={configured} onLogIn={() => setSession("in")} />;

  const logOut = async () => {
    await api("/api/admin/sesion", { method: "DELETE" });
    setSession("out");
  };

  return (
    <div className="pt-safe min-h-dvh bg-paper-3">
      <header className="border-b border-line-2 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-4 lg:px-6">
          <p className="display-font text-[20px] text-ink">Administración</p>
          <button
            type="button"
            onClick={logOut}
            className="ml-auto text-[13px] font-bold text-ink-3 underline underline-offset-2"
          >
            Cerrar sesión
          </button>
          <nav className="-mb-px flex w-full gap-1 overflow-x-auto" aria-label="Secciones">
            {TABS_ADMIN.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`shrink-0 border-b-[3px] px-3 py-2.5 text-[15px] font-bold ${
                  tab === id ? "border-head text-ink" : "border-transparent text-ink-3"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
        {tab === "live" ? (
          <LiveAdmin onExpired={expired} />
        ) : tab === "schedule" ? (
          <Schedule onExpired={expired} />
        ) : tab === "reporters" ? (
          <ReportersAdmin onExpired={expired} />
        ) : tab === "businesses" ? (
          <BusinessesAdmin onExpired={expired} />
        ) : (
          <PhotosAdmin onExpired={expired} />
        )}
      </main>
    </div>
  );
}

function LogIn({ configured, onLogIn }: { configured: boolean; onLogIn: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/admin/sesion", { method: "POST", body: JSON.stringify({ key }) });
    setBusy(false);
    if (r.ok) onLogIn();
    else setError(r.error);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-paper-3 px-4">
      <form onSubmit={send} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-sm">
        <p className="display-font text-[22px] text-ink">Administración</p>
        {configured ? (
          <>
            <label htmlFor="key" className="mt-5 block text-sm font-bold text-ink">
              Contraseña
            </label>
            <input
              id="key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-line-3 px-3 py-2.5 text-ink focus:border-ink focus:outline-none"
            />
            {error ? <p className="mt-2 text-sm font-semibold text-alert">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !key}
              className="mt-5 w-full rounded-full bg-ink py-3 font-bold text-paper disabled:opacity-40"
            >
              {busy ? "Entrando…" : "Entrar"}
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-2">
            Falta configurar <code className="font-mono">ADMIN_CLAVE</code> en el servidor. Ver{" "}
            <code className="font-mono">.env.example</code>.
          </p>
        )}
      </form>
    </div>
  );
}
