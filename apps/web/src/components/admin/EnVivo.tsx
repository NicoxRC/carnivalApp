"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, BotonPrimario, BotonSec, COLOR_ROL, ENTRADA, NOMBRE_ROL, TARJETA, useReporteros } from "@/components/admin/comun";
import { sinSenal } from "@/lib/eta";
import { distanciaCorta, haceCuanto } from "@/lib/formato";
import { useEstadoDesfile, useReloj } from "@/lib/hooks/useEstadoDesfile";
import { referenciaEnSenda, SENDA } from "@/lib/senda";
import { ROLES, type Rol } from "@/lib/tipos";

const MapaDesfile = dynamic(() => import("@/components/MapaDesfile"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-papel-2" />,
});

const ESTADO_DESFILE = { programado: "Sin arrancar", en_curso: "En curso", finalizado: "Finalizado" } as const;

/** Un pitido corto. Sin archivo de audio: se genera en el momento. */
function pitar() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.frequency.value = 880;
    vol.gain.setValueAtTime(0.25, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => void ctx.close();
  } catch {
    // Sin audio (el navegador lo bloquea hasta el primer clic): queda el aviso visual.
  }
}

export function EnVivo({ onVencida }: { onVencida: () => void }) {
  const { estado, conexion, desfaseMs } = useEstadoDesfile();
  const { reporteros } = useReporteros(onVencida, 15_000);
  const ahora = useReloj(1000) + desfaseMs;
  const [error, setError] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<Rol | null>(null);

  const manejar = useCallback(
    (r: { ok: boolean; error?: string; status?: number }) => {
      if (r.ok) return setError(null);
      if (r.status === 401) onVencida();
      setError(r.error ?? "Error");
    },
    [onVencida],
  );

  const accion = async (a: "iniciar" | "finalizar" | "reiniciar") => {
    if (!estado) return;
    if (a === "reiniciar" && !confirm("¿Reiniciar el desfile? Se borran todas las posiciones de este recorrido.")) return;
    if (a === "finalizar" && !confirm("¿Marcar el desfile como finalizado?")) return;
    manejar(await api(`/api/admin/desfiles/${estado.desfileId}`, { method: "PATCH", body: JSON.stringify({ accion: a }) }));
  };

  /** Corrección a mano: el admin pone un rol donde debe ir. Entra por la misma puerta que un reportero. */
  const corregir = async (lat: number, lng: number) => {
    if (!estado || !corrigiendo) return;
    const rol = corrigiendo;
    setCorrigiendo(null);
    manejar(
      await api("/api/posiciones", {
        method: "POST",
        body: JSON.stringify({ rol, lat, lng, desfileId: estado.desfileId }),
      }),
    );
  };

  // --- Alertas: un rol que lleva más de 5 min callado con el desfile en curso ---
  const callados = estado?.estado === "en_curso"
    ? ROLES.filter((rol) => {
        const pos = estado.posiciones[rol];
        return pos ? sinSenal(pos.ts, ahora) : false;
      })
    : [];
  const clave = callados.join(",");
  const avisados = useRef("");
  useEffect(() => {
    // Suena una vez por cada cambio en quiénes están callados, no cada segundo.
    if (clave && clave !== avisados.current) {
      pitar();
      const texto = `Sin señal: ${clave.split(",").map((r) => NOMBRE_ROL[r as Rol]).join(", ")}`;
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Sigue el Desfile", { body: texto, tag: "sin-senal" });
        } catch {
          // Algunos navegadores solo notifican desde un service worker.
        }
      }
    }
    avisados.current = clave;
    document.title = clave ? "⚠ SIN SEÑAL · Administración" : "Administración · Sigue el Desfile";
  }, [clave]);

  const [permisoNotif, setPermisoNotif] = useState<string>("default");
  useEffect(() => {
    if ("Notification" in window) setPermisoNotif(Notification.permission);
  }, []);

  return (
    <div className="space-y-5">
      {callados.length > 0 && (
        <div role="alert" className="rounded-3xl bg-alerta p-5 text-white">
          <p className="text-[17px] font-extrabold">
            Sin señal hace más de 5 min: {callados.map((r) => NOMBRE_ROL[r]).join(", ")}
          </p>
          <p className="mt-1 text-[14px]">
            Llamá al reportero o pedile al suplente que abra su panel: toma el rol solo. Mientras
            tanto podés poner el punto a mano con «Corregir» en el mapa.
          </p>
        </div>
      )}

      <section className={TARJETA}>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[13px] font-semibold text-tinta-3">
              {estado ? `${estado.nombre} · ${estado.fecha} ${estado.horaInicio}` : "No hay ningún desfile programado"}
            </p>
            <p className="fuente-display text-[22px] text-tinta">{estado ? ESTADO_DESFILE[estado.estado] : "—"}</p>
          </div>
          <span className="text-[12px] font-bold text-tinta-3">
            {conexion === "en_vivo" ? "· datos en vivo" : "· reconectando…"}
          </span>
          {estado && (
            <div className="ml-auto flex flex-wrap gap-2">
              <BotonSec onClick={() => accion("iniciar")}>Marcar en curso</BotonSec>
              <BotonSec onClick={() => accion("finalizar")}>Finalizar</BotonSec>
              <BotonSec peligro onClick={() => accion("reiniciar")}>
                Reiniciar
              </BotonSec>
            </div>
          )}
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-alerta">{error}</p> : null}
        <p className="mt-3 text-[13px] text-tinta-3">
          Este es el desfile que ve el público ahora. Pasa a «En curso» solo, con la primera
          posición que llegue. Los demás desfiles se manejan en la pestaña Programación.
          {permisoNotif === "default" && (
            <>
              {" "}
              <button
                type="button"
                className="font-bold underline underline-offset-2"
                onClick={() => void Notification.requestPermission().then(setPermisoNotif)}
              >
                Activar alertas de «sin señal» en este navegador
              </button>
            </>
          )}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {ROLES.map((rol) => {
          const pos = estado?.posiciones[rol];
          const apagado = pos ? sinSenal(pos.ts, ahora) : false;
          const asignados = (reporteros ?? []).filter((r) => r.rol === rol && r.activo);
          return (
            <article key={rol} className={TARJETA}>
              <p className="flex items-center gap-2 text-[15px] font-extrabold text-tinta">
                <span className={`size-3 rounded-full ${COLOR_ROL[rol]}`} aria-hidden />
                {NOMBRE_ROL[rol]}
                <span className="ml-auto">
                  <BotonSec activo={corrigiendo === rol} onClick={() => setCorrigiendo(corrigiendo === rol ? null : rol)}>
                    Corregir
                  </BotonSec>
                </span>
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

      <section className={`${TARJETA} p-0 overflow-hidden`}>
        {corrigiendo && (
          <p className="bg-tinta px-4 py-2.5 text-[14px] font-bold text-papel">
            Tocá en el mapa dónde va la {NOMBRE_ROL[corrigiendo].toLowerCase()}.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => setCorrigiendo(null)}>
              Cancelar
            </button>
          </p>
        )}
        <div className="relative h-[420px]">
          <MapaDesfile
            estado={estado}
            puntos={[]}
            densidad={null}
            puntoSeleccionado={null}
            onPuntoClick={() => undefined}
            ubicacion={null}
            ahora={ahora}
            modoMarcarPunto={corrigiendo !== null}
            onPuntoMarcado={(lat, lng) => void corregir(lat, lng)}
            encuadre={null}
          />
        </div>
        {estado?.posiciones.cabeza && estado.posiciones.cola && estado.posiciones.cabeza.metros > estado.posiciones.cola.metros ? (
          <p className="px-5 py-3 text-[14px] text-tinta-2">
            Largo del desfile:{" "}
            <b>{distanciaCorta(estado.posiciones.cabeza.metros - estado.posiciones.cola.metros)}</b> entre la
            cabeza y la cola.
          </p>
        ) : null}
      </section>

      <AvisosAdmin avisos={estado?.avisos ?? []} onRespuesta={manejar} />
    </div>
  );
}

/** Mensajes para todo el mundo: salen arriba del mapa de cada celular al instante. */
function AvisosAdmin({
  avisos,
  onRespuesta,
}: {
  avisos: { id: string; texto: string; nivel: string; expiraEn: number | null }[];
  onRespuesta: (r: { ok: boolean; error?: string; status?: number }) => void;
}) {
  const [texto, setTexto] = useState("");
  const [nivel, setNivel] = useState("info");
  const [duracionMin, setDuracion] = useState(60);

  const publicar = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api("/api/admin/avisos", { method: "POST", body: JSON.stringify({ texto, nivel, duracionMin }) });
    onRespuesta(r);
    if (r.ok) setTexto("");
  };

  return (
    <section className={TARJETA}>
      <p className="text-[15px] font-extrabold text-tinta">Mensaje para todos</p>
      <p className="mt-1 text-[13px] text-tinta-3">
        Sale arriba del mapa de todo el que tenga la app abierta. Para cosas como «arranca con 40 min
        de retraso» o «desvío por la carrera 27». Se quita solo cuando vence.
      </p>
      <form onSubmit={publicar} className="mt-3 flex flex-wrap items-end gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={160}
          placeholder="Escribí el mensaje (máx. 160 letras)"
          aria-label="Mensaje"
          className={`${ENTRADA} mt-0 min-w-64 flex-1`}
        />
        <select value={nivel} onChange={(e) => setNivel(e.target.value)} aria-label="Tipo" className={`${ENTRADA} mt-0 w-auto`}>
          <option value="info">Información</option>
          <option value="alerta">Alerta (rojo)</option>
        </select>
        <select
          value={duracionMin}
          onChange={(e) => setDuracion(Number(e.target.value))}
          aria-label="Duración"
          className={`${ENTRADA} mt-0 w-auto`}
        >
          <option value={30}>30 min</option>
          <option value={60}>1 hora</option>
          <option value={180}>3 horas</option>
          <option value={720}>12 horas</option>
        </select>
        <BotonPrimario disabled={!texto.trim()}>Publicar</BotonPrimario>
      </form>
      {avisos.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-borde pt-3">
          {avisos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 text-[14px]">
              <span className={`size-2.5 shrink-0 rounded-full ${a.nivel === "alerta" ? "bg-alerta" : "bg-tinta"}`} aria-hidden />
              <span className="min-w-0 flex-1 text-tinta">{a.texto}</span>
              <BotonSec
                peligro
                onClick={async () => onRespuesta(await api(`/api/admin/avisos/${a.id}`, { method: "DELETE" }))}
              >
                Quitar
              </BotonSec>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
