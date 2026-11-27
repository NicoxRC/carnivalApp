"use client";

import { useState } from "react";

import { LoginForm } from "@/components/LoginForm";

import { BusinessesAdmin } from "@/components/admin/Businesses";
import { LiveAdmin } from "@/components/admin/Live";
import { PhotosAdmin } from "@/components/admin/Photos";
import { Schedule } from "@/components/admin/Schedule";
import { ReportersAdmin } from "@/components/admin/Reporters";
import { useSession } from "@/lib/hooks/useSession";

const TABS_ADMIN = [
  ["live", "En vivo"],
  ["schedule", "Programación"],
  ["reporters", "Reporteros"],
  ["businesses", "Comercios"],
  ["photos", "Fotos"],
] as const;

type Tab = (typeof TABS_ADMIN)[number][0];

export function AdminPanel() {
  const { session, retry, loggedIn, logOut, expired } = useSession();
  const [tab, setTab] = useState<Tab>("live");

  if (session.state === "loading") return <p className="p-8 text-sm text-ink-3">Cargando…</p>;
  if (session.state === "offline") {
    return (
      <Card>
        <p className="mt-3 text-sm text-ink-2">Sin conexión con el servidor.</p>
        <button type="button" onClick={retry} className="mt-5 w-full rounded-full bg-ink py-3 font-bold text-paper">
          Probar otra vez
        </button>
      </Card>
    );
  }
  if (session.state === "out") {
    return (
      <Card>
        <LoginForm tone="light" expired={session.expired} onLoggedIn={loggedIn} />
      </Card>
    );
  }
  if (!session.user.permissions.some((p) => !p.startsWith("positions:"))) {
    return (
      <Card>
        <p className="mt-3 text-sm text-ink-2">
          {session.user.name}: tu usuario no tiene acceso a la administración.
        </p>
        <button type="button" onClick={logOut} className="mt-5 w-full rounded-full bg-ink py-3 font-bold text-paper">
          Salir
        </button>
      </Card>
    );
  }

  return (
    <div className="pt-safe min-h-dvh bg-paper-3">
      <header className="border-b border-line-2 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-4 lg:px-6">
          <p className="display-font text-[20px] text-ink">Administración</p>
          <span className="ml-auto text-[13px] text-ink-3">{session.user.name}</span>
          <button
            type="button"
            onClick={logOut}
            className=" text-[13px] font-bold text-ink-3 underline underline-offset-2"
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper-3 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-sm">
        <p className="display-font text-[22px] text-ink">Administración</p>
        {children}
      </div>
    </div>
  );
}
