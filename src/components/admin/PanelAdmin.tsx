"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { CATEGORIAS_COMERCIO, PLANES_COMERCIO } from "@/lib/comercios";
import { DESFILE_DEMO } from "@/lib/datos/modo";
import { sinSenal } from "@/lib/eta";
import { distanciaCorta, haceCuanto } from "@/lib/formato";
import { useEstadoDesfile, useReloj } from "@/lib/hooks/useEstadoDesfile";
import { referenciaEnSenda, SENDA } from "@/lib/senda";
import {
  ROLES,
  type CategoriaComercio,
  type Comercio,
  type PlanComercio,
  type Reportero,
  type Rol,
} from "@/lib/tipos";

// MapLibre toca `window` al importarse.
const MapaSelector = dynamic(() => import("@/components/admin/MapaSelector"), {
  ssr: false,
  loading: () => <div className="h-72 w-full rounded-2xl bg-papel-2" />,
});

/**
 * Panel de administración. Lo usa el equipo, no el público: prioriza que se
 * entienda de un vistazo qué está pasando y que sea difícil romper algo por
 * accidente (todo lo destructivo pide confirmación).
 */

const NOMBRE_ROL: Record<Rol, string> = { cabeza: "Cabeza", mitad: "Mitad", cola: "Cola" };
const COLOR_ROL: Record<Rol, string> = { cabeza: "bg-cabeza", mitad: "bg-mitad", cola: "bg-cola" };

type Pestana = "vivo" | "reporteros" | "comercios";

/** fetch con JSON, que devuelve el error del servidor en vez de lanzar. */
async function api<T>(url: string, init?: RequestInit): Promise<{ ok: true; datos: T } | { ok: false; error: string; status: number }> {
  try {
    const r = await fetch(url, {
      cache: "no-store",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const d = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) return { ok: false, error: d.error ?? `Error ${r.status}`, status: r.status };
    return { ok: true, datos: d };
  } catch {
    return { ok: false, error: "Sin conexión con el servidor.", status: 0 };
  }
}

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
            {(
              [
                ["vivo", "En vivo"],
                ["reporteros", "Reporteros"],
                ["comercios", "Comercios"],
              ] as const
            ).map(([id, etiqueta]) => (
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
        ) : pestana === "reporteros" ? (
          <Reporteros onVencida={vencida} />
        ) : (
          <Comercios onVencida={vencida} />
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

/* --------------------------------- En vivo -------------------------------- */

function useReporteros(onVencida: () => void, cadaMs?: number) {
  const [reporteros, setReporteros] = useState<Reportero[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const r = await api<{ reporteros: Reportero[] }>("/api/admin/reporteros");
    if (r.ok) {
      setReporteros(r.datos.reporteros);
      setError(null);
    } else if (r.status === 401) onVencida();
    else setError(r.error);
  }, [onVencida]);

  useEffect(() => {
    void recargar();
    if (!cadaMs) return;
    const t = setInterval(recargar, cadaMs);
    return () => clearInterval(t);
  }, [recargar, cadaMs]);

  return { reporteros, error, recargar, setReporteros };
}

const ESTADO_DESFILE = {
  programado: "Sin arrancar",
  en_curso: "En curso",
  finalizado: "Finalizado",
} as const;

function EnVivo({ onVencida }: { onVencida: () => void }) {
  const { estado, conexion, desfaseMs } = useEstadoDesfile(DESFILE_DEMO);
  const { reporteros } = useReporteros(onVencida, 15_000);
  const ahora = useReloj(1000) + desfaseMs;
  const [error, setError] = useState<string | null>(null);

  const accion = async (a: "iniciar" | "finalizar" | "reiniciar") => {
    if (
      a === "reiniciar" &&
      !confirm("¿Reiniciar el desfile? Se borran todas las posiciones de este recorrido.")
    ) {
      return;
    }
    if (a === "finalizar" && !confirm("¿Marcar el desfile como finalizado?")) return;
    const r = await api("/api/admin/desfile", {
      method: "POST",
      body: JSON.stringify({ accion: a, desfileId: DESFILE_DEMO }),
    });
    if (!r.ok) {
      if (r.status === 401) onVencida();
      setError(r.error);
    } else setError(null);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-blanco p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[13px] font-semibold text-tinta-3">{estado?.nombre ?? "Desfile"}</p>
            <p className="fuente-display text-[22px] text-tinta">
              {estado ? ESTADO_DESFILE[estado.estado] : "…"}
            </p>
          </div>
          <span className="text-[12px] font-bold text-tinta-3">
            {conexion === "en_vivo" ? "· datos en vivo" : "· reconectando…"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <BotonSec onClick={() => accion("iniciar")}>Marcar en curso</BotonSec>
            <BotonSec onClick={() => accion("finalizar")}>Finalizar</BotonSec>
            <BotonSec peligro onClick={() => accion("reiniciar")}>
              Reiniciar
            </BotonSec>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-alerta">{error}</p> : null}
        <p className="mt-3 text-[13px] text-tinta-3">
          El desfile pasa a «En curso» solo, con la primera posición que llegue.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {ROLES.map((rol) => {
          const pos = estado?.posiciones[rol];
          const apagado = pos ? sinSenal(pos.ts, ahora) : false;
          const asignados = (reporteros ?? []).filter((r) => r.rol === rol && r.activo);
          return (
            <article key={rol} className="rounded-3xl bg-blanco p-5 shadow-sm">
              <p className="flex items-center gap-2 text-[15px] font-extrabold text-tinta">
                <span className={`size-3 rounded-full ${COLOR_ROL[rol]}`} aria-hidden />
                {NOMBRE_ROL[rol]}
              </p>
              {pos ? (
                <>
                  <p className={`mt-3 text-[20px] font-extrabold ${apagado ? "text-alerta" : "text-tinta"}`}>
                    {apagado ? "Sin señal" : haceCuanto(pos.ts, ahora)}
                  </p>
                  <p className="text-[13px] text-tinta-3">
                    {apagado ? `último dato ${haceCuanto(pos.ts, ahora)}` : "último dato"}
                  </p>
                  <p className="mt-2 text-[14px] font-semibold text-tinta-2">
                    {referenciaEnSenda(pos.metros, "va").frase} · km{" "}
                    {(pos.metros / 1000).toFixed(2).replace(".", ",")} de{" "}
                    {(SENDA.longitudMetros / 1000).toFixed(1).replace(".", ",")}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[15px] font-semibold text-tinta-3">Todavía no reporta</p>
              )}
              <ul className="mt-4 space-y-1 border-t border-borde pt-3 text-[13px]">
                {asignados.length === 0 ? (
                  <li className="font-semibold text-aviso-txt">Nadie asignado a este rol</li>
                ) : (
                  asignados.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2 text-tinta-2">
                      <span className="truncate">{r.nombre}</span>
                      <span className="shrink-0 text-tinta-3">
                        {r.ultimaSenalTs ? haceCuanto(r.ultimaSenalTs, ahora) : "nunca"}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </article>
          );
        })}
      </section>

      {estado?.posiciones.cabeza && estado.posiciones.cola ? (
        <p className="text-[14px] text-tinta-2">
          Largo del desfile:{" "}
          <b>{distanciaCorta(estado.posiciones.cabeza.metros - estado.posiciones.cola.metros)}</b>{" "}
          entre la cabeza y la cola.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------- Reporteros ------------------------------- */

function Reporteros({ onVencida }: { onVencida: () => void }) {
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
          por rol por si a alguien se le acaba la batería.
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

/* -------------------------------- Comercios ------------------------------- */

type Borrador = Omit<Comercio, "id" | "lat" | "lng"> & { id: string | null; lat: number | null; lng: number | null };

const VACIO: Borrador = {
  id: null,
  nombre: "",
  categoria: "restaurante",
  descripcion: "",
  direccion: "",
  horario: "",
  lat: null,
  lng: null,
  plan: null,
  promo: null,
  visible: true,
};

function Comercios({ onVencida }: { onVencida: () => void }) {
  const [comercios, setComercios] = useState<Comercio[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [filtro, setFiltro] = useState("");

  const recargar = useCallback(async () => {
    const r = await api<{ comercios: Comercio[] }>("/api/admin/comercios");
    if (r.ok) setComercios(r.datos.comercios);
    else if (r.status === 401) onVencida();
    else setError(r.error);
  }, [onVencida]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const guardar = async (b: Borrador) => {
    const r = await api(b.id ? `/api/admin/comercios/${b.id}` : "/api/admin/comercios", {
      method: b.id ? "PUT" : "POST",
      body: JSON.stringify(b),
    });
    if (!r.ok) {
      if (r.status === 401) onVencida();
      return r.error;
    }
    setEditando(null);
    void recargar();
    return null;
  };

  const alternarVisible = async (c: Comercio) => {
    await guardar({ ...c, visible: !c.visible });
  };

  const borrar = async (c: Comercio) => {
    if (!confirm(`¿Borrar «${c.nombre}» del mapa? Si solo es por hoy, mejor ocultalo.`)) return;
    const r = await api(`/api/admin/comercios/${c.id}`, { method: "DELETE" });
    if (!r.ok) setError(r.error);
    void recargar();
  };

  if (editando) {
    return <FormComercio inicial={editando} onGuardar={guardar} onCancelar={() => setEditando(null)} />;
  }

  const lista = (comercios ?? []).filter((c) =>
    c.nombre.toLowerCase().includes(filtro.trim().toLowerCase()),
  );
  const conPauta = (comercios ?? []).filter((c) => c.plan).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditando(VACIO)}
          className="rounded-full bg-tinta px-5 py-2.5 font-bold text-papel"
        >
          Agregar comercio
        </button>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por nombre"
          aria-label="Buscar comercio"
          className="min-w-48 flex-1 rounded-xl border border-borde-3 bg-blanco px-3 py-2.5 text-tinta focus:border-tinta focus:outline-none"
        />
        {comercios ? (
          <p className="text-[13px] text-tinta-3">
            {comercios.length} en total · {conPauta} con pauta
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm font-semibold text-alerta">{error}</p> : null}

      <section className="overflow-hidden rounded-3xl bg-blanco shadow-sm">
        {comercios === null ? (
          <p className="p-5 text-sm text-tinta-3">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="p-5 text-sm text-tinta-3">No hay comercios.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {lista.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-48 flex-1">
                  <p className={`font-bold ${c.visible ? "text-tinta" : "text-tinta-4"}`}>
                    {c.nombre}
                    {c.plan ? (
                      <span className="ml-2 rounded bg-papel px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-tinta-2">
                        PAUTA · {PLANES_COMERCIO[c.plan].toUpperCase()}
                      </span>
                    ) : null}
                    {!c.visible ? (
                      <span className="ml-2 text-[12px] font-semibold text-tinta-4">(oculto)</span>
                    ) : null}
                  </p>
                  <p className="text-[13px] text-tinta-3">
                    {CATEGORIAS_COMERCIO[c.categoria]}
                    {c.direccion ? ` · ${c.direccion}` : ""}
                  </p>
                  {c.promo ? <p className="text-[13px] font-semibold text-cabeza-txt">{c.promo}</p> : null}
                </div>
                <BotonSec onClick={() => setEditando(c)}>Editar</BotonSec>
                <BotonSec onClick={() => void alternarVisible(c)}>{c.visible ? "Ocultar" : "Mostrar"}</BotonSec>
                <BotonSec peligro onClick={() => void borrar(c)}>
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

function FormComercio({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: Borrador;
  onGuardar: (b: Borrador) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [b, setB] = useState<Borrador>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campo = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError(await onGuardar(b));
    setOcupado(false);
  };

  const entrada =
    "mt-1.5 w-full rounded-xl border border-borde-3 bg-blanco px-3 py-2.5 text-tinta focus:border-tinta focus:outline-none";

  return (
    <form onSubmit={enviar} className="rounded-3xl bg-blanco p-5 shadow-sm">
      <p className="fuente-display text-[20px] text-tinta">{b.id ? "Editar comercio" : "Nuevo comercio"}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Campo etiqueta="Nombre">
            <input value={b.nombre} onChange={(e) => campo("nombre", e.target.value)} className={entrada} required />
          </Campo>
          <Campo etiqueta="Categoría">
            <select
              value={b.categoria}
              onChange={(e) => campo("categoria", e.target.value as CategoriaComercio)}
              className={entrada}
            >
              {Object.entries(CATEGORIAS_COMERCIO).map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Qué ofrece" ayuda="Una línea: lo que le sirve a quien está en la senda.">
            <textarea
              value={b.descripcion}
              onChange={(e) => campo("descripcion", e.target.value)}
              rows={2}
              className={entrada}
            />
          </Campo>
          <Campo etiqueta="Cómo encontrarlo" ayuda="Mejor una referencia («frente a Cristo Rey») que una dirección.">
            <input value={b.direccion} onChange={(e) => campo("direccion", e.target.value)} className={entrada} />
          </Campo>
          <Campo etiqueta="Horario">
            <input
              value={b.horario}
              onChange={(e) => campo("horario", e.target.value)}
              placeholder="10:00 a. m. – 8:00 p. m."
              className={entrada}
            />
          </Campo>
        </div>

        <div className="space-y-4">
          {/* Un div y no <label>: dentro de un label, cada toque en el mapa
              se reenviaría al botón de zoom. */}
          <div className="text-sm font-bold text-tinta">
            Ubicación
            <span className="block text-[12px] font-normal text-tinta-3">
              Tocá en el mapa donde queda, o arrastrá el pin.
            </span>
            <div className="mt-1.5">
              <MapaSelector
                lat={b.lat}
                lng={b.lng}
                onCambio={(lat, lng) => setB((x) => ({ ...x, lat, lng }))}
              />
            </div>
          </div>

          <fieldset className="rounded-2xl border border-borde-2 p-4">
            <legend className="px-1 text-sm font-bold text-tinta">Pauta</legend>
            <select
              value={b.plan ?? ""}
              onChange={(e) => campo("plan", (e.target.value || null) as PlanComercio | null)}
              aria-label="Plan"
              className={entrada}
            >
              <option value="">Sin plan (aparece igual en el mapa)</option>
              {Object.entries(PLANES_COMERCIO).map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
            {b.plan ? (
              <label className="mt-3 block text-sm font-bold text-tinta">
                Oferta
                <input
                  value={b.promo ?? ""}
                  onChange={(e) => campo("promo", e.target.value)}
                  placeholder="Segundo jugo gratis mostrando la app"
                  className={entrada}
                />
              </label>
            ) : null}
            <p className="mt-2 text-[12px] text-tinta-3">
              Con plan, la ficha muestra la oferta y lleva el sello «Pauta». Aparecer en el mapa no
              depende de pagar.
            </p>
          </fieldset>

          <label className="flex items-center gap-2 text-sm font-bold text-tinta">
            <input type="checkbox" checked={b.visible} onChange={(e) => campo("visible", e.target.checked)} />
            Visible en el mapa
          </label>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm font-semibold text-alerta">{error}</p> : null}
      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={ocupado}
          className="rounded-full bg-tinta px-6 py-2.5 font-bold text-papel disabled:opacity-40"
        >
          {ocupado ? "Guardando…" : "Guardar"}
        </button>
        <BotonSec onClick={onCancelar}>Cancelar</BotonSec>
      </div>
    </form>
  );
}

/* --------------------------------- Piezas -------------------------------- */

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-bold text-tinta">
      {etiqueta}
      {ayuda ? <span className="block text-[12px] font-normal text-tinta-3">{ayuda}</span> : null}
      {children}
    </label>
  );
}

function BotonSec({
  children,
  onClick,
  peligro,
}: {
  children: React.ReactNode;
  onClick: () => void;
  peligro?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold ${
        peligro ? "border-alerta/40 text-alerta" : "border-borde-3 text-tinta-2"
      } active:bg-papel-2`}
    >
      {children}
    </button>
  );
}
