"use client";

import { useCallback, useEffect, useState } from "react";

import { Comercios } from "@/components/admin/Comercios";
import { api } from "@/components/admin/comun";
import { EnVivo } from "@/components/admin/EnVivo";
import { Fotos } from "@/components/admin/Fotos";
import { Programacion } from "@/components/admin/Programacion";
import { Reporteros } from "@/components/admin/Reporteros";

/**
 * Panel de administración. Lo usa el equipo, no el público: prioriza que se
 * entienda de un vistazo qué está pasando y que sea difícil romper algo por
 * accidente (todo lo destructivo pide confirmación).
 */

const PESTANAS = [
  ["vivo", "En vivo"],
  ["programacion", "Programación"],
  ["reporteros", "Reporteros"],
  ["comercios", "Comercios"],
  ["fotos", "Fotos"],
] as const;

type Pestana = (typeof PESTANAS)[number][0];

export function PanelAdmin() {
  const [sesion, setSesion] = useState<"cargando" | "fuera" | "dentro">("cargando");
  const [configurado, setConfigurado] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("vivo");

  useEffect(() => {
    void api<{ admin: boolean; configurado: boolean }>("/api/admin/sesion").then((r) => {
      if (r.ok) {
        setConfigurado(r.datos.configurado);
        setSesion(r.datos.admin ? "dentro" : "fuera");
      } else setSesion("fuera");
    });
  }, []);

  const vencida = useCallback(() => setSesion("fuera"), []);

  if (sesion === "cargando") return <p className="p-8 text-sm text-tinta-3">Cargando…</p>;
  if (sesion === "fuera") return <Entrar configurado={configurado} onEntrar={() => setSesion("dentro")} />;

  const salir = async () => {
    await api("/api/admin/sesion", { method: "DELETE" });
    setSesion("fuera");
  };

  return (
    <div className="pt-seguro min-h-dvh bg-papel-3">
      <header className="border-b border-borde-2 bg-blanco">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-4 lg:px-6">
          <p className="fuente-display text-[20px] text-tinta">Administración</p>
          <button
            type="button"
            onClick={salir}
            className="ml-auto text-[13px] font-bold text-tinta-3 underline underline-offset-2"
          >
            Cerrar sesión
          </button>
          <nav className="-mb-px flex w-full gap-1 overflow-x-auto" aria-label="Secciones">
            {PESTANAS.map(([id, etiqueta]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPestana(id)}
                aria-current={pestana === id ? "page" : undefined}
                className={`shrink-0 border-b-[3px] px-3 py-2.5 text-[15px] font-bold ${
                  pestana === id ? "border-cabeza text-tinta" : "border-transparent text-tinta-3"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
        {pestana === "vivo" ? (
          <EnVivo onVencida={vencida} />
        ) : pestana === "programacion" ? (
          <Programacion onVencida={vencida} />
        ) : pestana === "reporteros" ? (
          <Reporteros onVencida={vencida} />
        ) : pestana === "comercios" ? (
          <Comercios onVencida={vencida} />
        ) : (
          <Fotos onVencida={vencida} />
        )}
      </main>
    </div>
  );
}

/* --------------------------------- Entrar -------------------------------- */

function Entrar({ configurado, onEntrar }: { configurado: boolean; onEntrar: () => void }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    const r = await api("/api/admin/sesion", { method: "POST", body: JSON.stringify({ clave }) });
    setOcupado(false);
    if (r.ok) onEntrar();
    else setError(r.error);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-papel-3 px-4">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-3xl bg-blanco p-6 shadow-sm">
        <p className="fuente-display text-[22px] text-tinta">Administración</p>
        {configurado ? (
          <>
            <label htmlFor="clave" className="mt-5 block text-sm font-bold text-tinta">
              Contraseña
            </label>
            <input
              id="clave"
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-borde-3 px-3 py-2.5 text-tinta focus:border-tinta focus:outline-none"
            />
            {error ? <p className="mt-2 text-sm font-semibold text-alerta">{error}</p> : null}
            <button
              type="submit"
              disabled={ocupado || !clave}
              className="mt-5 w-full rounded-full bg-tinta py-3 font-bold text-papel disabled:opacity-40"
            >
              {ocupado ? "Entrando…" : "Entrar"}
            </button>
          </>
        ) : (
          <p className="mt-3 text-sm text-tinta-2">
            Falta configurar <code className="font-mono">ADMIN_CLAVE</code> en el servidor. Ver{" "}
            <code className="font-mono">.env.example</code>.
          </p>
        )}
      </form>
    </div>
  );
}
