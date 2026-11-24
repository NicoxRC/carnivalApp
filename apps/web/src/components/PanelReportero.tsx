"use client";

import { useCallback, useEffect, useState } from "react";

import { distanciaCorta, haceCuanto } from "@/lib/formato";
import { useReloj } from "@/lib/hooks/useEstadoDesfile";
import { INTERVALO_ENVIO_MS, PRECISION_ACEPTABLE_M, useReporte, type Reporte } from "@/lib/hooks/useReporte";
import { metrosEnSenda, referenciaEnSenda, SENDA } from "@/lib/senda";
import type { Reportero, Rol } from "@/lib/tipos";

/**
 * Panel de los reporteros: las tres personas que caminan con el desfile.
 *
 * Pantalla oscura y mínima: la llevan cuatro horas encendida, con una mano, a
 * pleno sol y empujados. Lo único que tienen que hacer es abrirla y darle a
 * «Empezar»; desde ahí el GPS sale solo. Lo demás en pantalla es para que
 * sepan que está funcionando sin tener que preguntar.
 */

const ROL: Record<Rol, { nombre: string; color: string; ayuda: string }> = {
  cabeza: { nombre: "Cabeza", color: "bg-cabeza", ayuda: "Caminá con la primera carroza o comparsa." },
  mitad: { nombre: "Mitad", color: "bg-mitad", ayuda: "Caminá a la mitad del desfile." },
  cola: { nombre: "Cola", color: "bg-cola", ayuda: "Caminá con lo último del desfile." },
};

type Sesion =
  | { estado: "cargando" }
  | { estado: "fuera" }
  | { estado: "dentro"; reportero: Reportero; desfile: string | null };

export function PanelReportero() {
  const [sesion, setSesion] = useState<Sesion>({ estado: "cargando" });

  useEffect(() => {
    fetch("/api/reportero/sesion", { cache: "no-store" })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ reportero: Reportero | null; desfile?: string | null }>)
          : { reportero: null, desfile: null },
      )
      .then((d) =>
        setSesion(
          d.reportero ? { estado: "dentro", reportero: d.reportero, desfile: d.desfile ?? null } : { estado: "fuera" },
        ),
      )
      .catch(() => setSesion({ estado: "fuera" }));
  }, []);

  const alVencer = useCallback(() => setSesion({ estado: "fuera" }), []);

  return (
    <div className="pt-seguro pb-seguro min-h-dvh bg-tinta text-papel">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
        {sesion.estado === "cargando" ? (
          <p className="m-auto text-sm text-tinta-4">Cargando…</p>
        ) : sesion.estado === "fuera" ? (
          <Entrar onEntrar={(reportero, desfile) => setSesion({ estado: "dentro", reportero, desfile })} />
        ) : (
          <Reportando
            reportero={sesion.reportero}
            desfile={sesion.desfile}
            onSalir={() => setSesion({ estado: "fuera" })}
            onVencida={alVencer}
          />
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Entrar -------------------------------- */

function Entrar({ onEntrar }: { onEntrar: (r: Reportero, desfile: string | null) => void }) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch("/api/reportero/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const d = (await r.json()) as { reportero?: Reportero; desfile?: string | null; error?: string };
      if (!r.ok || !d.reportero) setError(d.error ?? "No se pudo entrar.");
      else onEntrar(d.reportero, d.desfile ?? null);
    } catch {
      setError("Sin conexión. Intentá otra vez cuando tengas señal.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form onSubmit={enviar} className="my-auto">
      <p className="fuente-display text-[28px] leading-tight">Panel de reporteros</p>
      <p className="mt-2 text-[15px] text-tinta-4">
        Escribí el código que te dio el coordinador. Solo hay que hacerlo una vez por día.
      </p>
      <label className="mt-8 block text-sm font-bold" htmlFor="codigo">
        Tu código
      </label>
      <input
        id="codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABCD-2345"
        className="mt-2 w-full rounded-2xl border-2 border-tinta-2 bg-[#202024] px-4 py-4 text-center font-mono text-2xl tracking-[0.2em] text-papel placeholder:text-tinta-3 focus:border-papel focus:outline-none"
      />
      {error ? <p className="mt-3 text-sm font-semibold text-[#ff8a7a]">{error}</p> : null}
      <button
        type="submit"
        disabled={ocupado || codigo.replace(/[^A-Z0-9]/g, "").length < 8}
        className="mt-6 w-full rounded-full bg-papel py-4 text-lg font-extrabold text-tinta disabled:opacity-40"
      >
        {ocupado ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

/* ------------------------------- Reportando ------------------------------ */

function Reportando({
  reportero,
  desfile,
  onSalir,
  onVencida,
}: {
  reportero: Reportero;
  desfile: string | null;
  onSalir: () => void;
  onVencida: () => void;
}) {
  const r = useReporte(onVencida);
  const ahora = useReloj(1000);
  const rol = ROL[reportero.rol];
  // El GPS, la pantalla encendida y la sesión solo funcionan en https (o localhost).
  const [seguro, setSeguro] = useState(true);
  useEffect(() => setSeguro(window.isSecureContext), []);

  const salir = async () => {
    r.terminar();
    await fetch("/api/reportero/sesion", { method: "DELETE" }).catch(() => undefined);
    onSalir();
  };

  return (
    <>
      <header className="flex items-center gap-3">
        <span className={`size-4 shrink-0 rounded-full ${rol.color}`} aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-tinta-4">
            {reportero.nombre}
            {desfile ? ` · ${desfile}` : ""}
          </p>
          <p className="fuente-display text-[24px] leading-none">{rol.nombre}</p>
        </div>
        {r.activo ? null : (
          <button
            type="button"
            onClick={salir}
            className="ml-auto rounded-full border border-tinta-2 px-3 py-1.5 text-[13px] font-bold text-tinta-4"
          >
            Salir
          </button>
        )}
      </header>

      {r.activo ? (
        <Activo r={r} ahora={ahora} />
      ) : (
        <div className="my-auto">
          <p className="text-[17px] leading-snug text-papel">{rol.ayuda}</p>
          <ul className="mt-4 space-y-2 text-[15px] leading-snug text-tinta-4">
            <li>· Dejá esta pantalla abierta todo el recorrido. Tu ubicación sale sola.</li>
            <li>· Si el desfile se para o arranca, tocá «Estoy aquí».</li>
            <li>· Llevá batería externa: la pantalla va a estar encendida.</li>
          </ul>
          {r.gps === "denegado" || r.gps === "error" ? <AvisoGps gps={r.gps} /> : null}
          {seguro ? null : (
            <p className="mt-4 rounded-2xl bg-[#3a1512] px-4 py-3 text-[14px] font-semibold text-[#ff8a7a]">
              Esta página no está abierta por una conexión segura (https), y así el celular no
              entrega el GPS. Abrila desde la dirección oficial de la app.
            </p>
          )}
          <button
            type="button"
            onClick={r.empezar}
            className="mt-8 w-full rounded-full bg-ok py-5 text-xl font-extrabold text-blanco active:opacity-90"
          >
            Empezar a reportar
          </button>
        </div>
      )}
    </>
  );
}

function Activo({ r, ahora }: { r: Reporte; ahora: number }) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [hito, setHito] = useState("");

  // Dónde cree la app que está: si dice algo raro, el reportero lo nota al instante.
  const proy = r.fix ? metrosEnSenda(r.fix.lat, r.fix.lng) : null;
  const referencia = proy ? referenciaEnSenda(proy.metros, "estas").frase : null;
  const lejos = proy !== null && proy.desvioM > 150;

  const atrasado = r.ultimoEnvio !== null && ahora - r.ultimoEnvio > INTERVALO_ENVIO_MS * 3;
  const impreciso = r.fix !== null && r.fix.precisionM > PRECISION_ACEPTABLE_M;

  const tocarEstoyAqui = () => {
    setAviso(r.estoyAqui() ? "Listo, ya saben por dónde vas." : "Todavía no hay GPS. Usá la lista de abajo.");
    setTimeout(() => setAviso(null), 4000);
  };

  return (
    <div className="mt-6 flex flex-1 flex-col gap-4">
      {/* --- ¿Está funcionando? --- */}
      <section className="rounded-3xl bg-[#202024] p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <span
            className={`size-2.5 rounded-full ${
              r.red === "ok" && !atrasado ? "latido bg-ok" : "bg-mitad"
            }`}
            aria-hidden
          />
          {r.red === "sin_senal"
            ? "Sin señal: se guarda y se manda cuando vuelva"
            : r.enEspera
              ? "De respaldo: otro reportero lleva este rol"
              : atrasado
              ? "Hace rato no sale nada"
              : "Mandando tu ubicación"}
        </p>
        <p className="fuente-display mt-3 text-[30px] leading-none">
          {r.ultimoEnvio ? haceCuanto(r.ultimoEnvio, ahora) : "—"}
        </p>
        <p className="mt-1 text-[13px] text-tinta-4">último envío</p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-tinta-4">GPS</dt>
            <dd className="font-bold">
              {r.gps === "ok" && r.fix
                ? `± ${Math.round(r.fix.precisionM)} m`
                : r.gps === "buscando"
                  ? "buscando…"
                  : "sin GPS"}
            </dd>
          </div>
          <div>
            <dt className="text-tinta-4">Por mandar</dt>
            <dd className="font-bold">{r.pendientes === 0 ? "nada" : `${r.pendientes} puntos`}</dd>
          </div>
        </dl>
        {referencia ? (
          <p className="mt-3 text-[15px] font-semibold">
            {lejos ? `Estás a ${distanciaCorta(proy.desvioM)} de la senda` : referencia}
          </p>
        ) : null}
      </section>

      {r.gps === "denegado" || r.gps === "error" ? <AvisoGps gps={r.gps} /> : null}

      {r.enEspera ? (
        <p className="rounded-2xl bg-[#1d2a3a] px-4 py-3 text-[14px] font-semibold text-[#9fd0f5]">
          Otra persona con tu mismo rol está mandando su ubicación, así que la tuya no se usa por
          ahora. Dejá el panel abierto: si la otra se queda sin señal un minuto, entrás vos solo.
        </p>
      ) : null}

      {impreciso ? (
        <p className="rounded-2xl bg-[#3a2a10] px-4 py-3 text-[14px] font-semibold text-mitad">
          El GPS está muy impreciso (± {Math.round(r.fix!.precisionM)} m) y así no se manda. Salí a
          cielo abierto, o marcá por punto de referencia abajo.
        </p>
      ) : null}

      {r.pantallaEncendida === false ? (
        <p className="rounded-2xl bg-[#3a2a10] px-4 py-3 text-[14px] font-semibold text-mitad">
          La pantalla se puede apagar sola y entonces deja de mandar. Tocá la pantalla de vez en
          cuando o subí el tiempo de bloqueo del celular.
        </p>
      ) : r.pantallaEncendida === null ? (
        <p className="rounded-2xl bg-[#3a2a10] px-4 py-3 text-[14px] font-semibold text-mitad">
          Este navegador no deja mantener la pantalla encendida. Poné el bloqueo automático del
          celular en «Nunca» mientras reportas.
        </p>
      ) : null}

      {/* --- La acción principal --- */}
      <button
        type="button"
        onClick={tocarEstoyAqui}
        className="mt-auto w-full rounded-[28px] bg-cabeza py-7 text-[26px] font-extrabold text-blanco shadow-[0_10px_30px_-10px_rgba(255,106,31,0.6)] active:scale-[0.99]"
      >
        Estoy aquí
      </button>
      <p className="-mt-2 text-center text-[13px] text-tinta-4" aria-live="polite">
        {aviso ?? "Tocalo cuando el desfile se pare o vuelva a arrancar."}
      </p>

      {/* --- Sin GPS: por hito --- */}
      <details className="rounded-2xl bg-[#202024] px-4 py-3">
        <summary className="cursor-pointer text-[15px] font-bold">¿El GPS no funciona? Marcá por dónde vas</summary>
        <div className="mt-3 flex gap-2">
          <select
            value={hito}
            onChange={(e) => setHito(e.target.value)}
            className="min-w-0 flex-1 rounded-xl bg-tinta px-3 py-3 text-[15px] text-papel"
            aria-label="Punto de referencia"
          >
            <option value="">Elegí el punto más cercano…</option>
            {SENDA.hitos.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!hito}
            onClick={() => {
              r.marcarHito(hito);
              setAviso("Listo, marcado por el punto de referencia.");
              setHito("");
              setTimeout(() => setAviso(null), 4000);
            }}
            className="rounded-xl bg-papel px-4 font-extrabold text-tinta disabled:opacity-40"
          >
            Marcar
          </button>
        </div>
      </details>

      <button
        type="button"
        onClick={() => {
          if (confirm("¿Terminar? Tu ubicación deja de mandarse.")) r.terminar();
        }}
        className="w-full rounded-full border border-tinta-2 py-3 text-[15px] font-bold text-tinta-4"
      >
        Terminar el recorrido
      </button>
    </div>
  );
}

function AvisoGps({ gps }: { gps: "denegado" | "error" }) {
  return (
    <p className="mt-4 rounded-2xl bg-[#3a1512] px-4 py-3 text-[14px] font-semibold text-[#ff8a7a]">
      {gps === "denegado"
        ? "No diste permiso de ubicación. Activalo en los ajustes del navegador para este sitio, o marcá por punto de referencia."
        : "No se pudo leer el GPS. Revisá que la ubicación del celular esté prendida."}
    </p>
  );
}
