"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, PrimaryButton, SecondaryButton, POST_COLOR, INPUT_CLASS, POST_NAME, CARD_CLASS, useReporters } from "@/components/admin/common";
import { noSignal } from "@/lib/eta";
import { shortDistance, timeAgo } from "@/lib/format";
import { useParadeState, useClock } from "@/lib/hooks/useParadeState";
import { describePosition, COURSE } from "@/lib/course";
import { POSTS, type Post } from "@/lib/types";

const ParadeMap = dynamic(() => import("@/components/ParadeMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-paper-2" />,
});

const PARADE_STATE_LABEL = { scheduled: "Sin arrancar", in_progress: "En curso", finished: "Finalizado" } as const;

function beep() {
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
  } catch {}
}

export function LiveAdmin({ onExpired }: { onExpired: () => void }) {
  const { state, connection, clockOffsetMs } = useParadeState();
  const { reporters } = useReporters(onExpired, 15_000);
  const now = useClock(1000) + clockOffsetMs;
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<Post | null>(null);

  const handle = useCallback(
    (r: { ok: boolean; error?: string; status?: number }) => {
      if (r.ok) return setError(null);
      if (r.status === 401) onExpired();
      setError(r.error ?? "Error");
    },
    [onExpired],
  );

  const action = async (a: "start" | "finish" | "restart") => {
    if (!state) return;
    if (a === "restart" && !confirm("¿Reiniciar el desfile? Se borran todas las posiciones de este recorrido.")) return;
    if (a === "finish" && !confirm("¿Marcar el desfile como finalizado?")) return;
    handle(await api(`/api/admin/desfiles/${state.paradeId}`, { method: "PATCH", body: JSON.stringify({ action: a }) }));
  };

  const correct = async (lat: number, lng: number) => {
    if (!state || !correcting) return;
    const post = correcting;
    setCorrecting(null);
    handle(
      await api("/api/posiciones", {
        method: "POST",
        body: JSON.stringify({ post, lat, lng, paradeId: state.paradeId }),
      }),
    );
  };

  const silent = state?.state === "in_progress"
    ? POSTS.filter((post) => {
        const pos = state.positions[post];
        return pos ? noSignal(pos.ts, now) : false;
      })
    : [];
  const key = silent.join(",");
  const notified = useRef("");
  useEffect(() => {
    if (key && key !== notified.current) {
      beep();
      const text = `Sin señal: ${key.split(",").map((r) => POST_NAME[r as Post]).join(", ")}`;
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Sigue el Desfile", { body: text, tag: "no-signal" });
        } catch {}
      }
    }
    notified.current = key;
    document.title = key ? "⚠ SIN SEÑAL · Administración" : "Administración · Sigue el Desfile";
  }, [key]);

  const [notifyPermission, setNotifyPermission] = useState<string>("default");
  useEffect(() => {
    if ("Notification" in window) setNotifyPermission(Notification.permission);
  }, []);

  return (
    <div className="space-y-5">
      {silent.length > 0 && (
        <div role="alert" className="rounded-3xl bg-alert p-5 text-white">
          <p className="text-[17px] font-extrabold">
            Sin señal hace más de 5 min: {silent.map((r) => POST_NAME[r]).join(", ")}
          </p>
          <p className="mt-1 text-[14px]">
            Llamá al reportero o pedile al suplente que abra su panel: toma el rol solo. Mientras
            tanto podés poner el punto a mano con «Corregir» en el mapa.
          </p>
        </div>
      )}

      <section className={CARD_CLASS}>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[13px] font-semibold text-ink-3">
              {state ? `${state.name} · ${state.date} ${state.startTime}` : "No hay ningún desfile programado"}
            </p>
            <p className="display-font text-[22px] text-ink">{state ? PARADE_STATE_LABEL[state.state] : "—"}</p>
          </div>
          <span className="text-[12px] font-bold text-ink-3">
            {connection === "live" ? "· datos en vivo" : "· reconectando…"}
          </span>
          {state && (
            <div className="ml-auto flex flex-wrap gap-2">
              <SecondaryButton onClick={() => action("start")}>Marcar en curso</SecondaryButton>
              <SecondaryButton onClick={() => action("finish")}>Finalizar</SecondaryButton>
              <SecondaryButton danger onClick={() => action("restart")}>
                Reiniciar
              </SecondaryButton>
            </div>
          )}
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-alert">{error}</p> : null}
        <p className="mt-3 text-[13px] text-ink-3">
          Este es el desfile que ve el público ahora. Pasa a «En curso» solo, con la primera
          posición que llegue. Los demás desfiles se manejan en la pestaña Programación.
          {notifyPermission === "default" && (
            <>
              {" "}
              <button
                type="button"
                className="font-bold underline underline-offset-2"
                onClick={() => void Notification.requestPermission().then(setNotifyPermission)}
              >
                Activar alertas de «sin señal» en este navegador
              </button>
            </>
          )}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {POSTS.map((post) => {
          const pos = state?.positions[post];
          const off = pos ? noSignal(pos.ts, now) : false;
          const assigned = (reporters ?? []).filter((r) => r.post === post && r.active);
          return (
            <article key={post} className={CARD_CLASS}>
              <p className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
                <span className={`size-3 rounded-full ${POST_COLOR[post]}`} aria-hidden />
                {POST_NAME[post]}
                <span className="ml-auto">
                  <SecondaryButton active={correcting === post} onClick={() => setCorrecting(correcting === post ? null : post)}>
                    Corregir
                  </SecondaryButton>
                </span>
              </p>
              {pos ? (
                <>
                  <p className={`mt-3 text-[20px] font-extrabold ${off ? "text-alert" : "text-ink"}`}>
                    {off ? "Sin señal" : timeAgo(pos.ts, now)}
                  </p>
                  <p className="text-[13px] text-ink-3">
                    {off ? `último dato ${timeAgo(pos.ts, now)}` : "último dato"}
                  </p>
                  <p className="mt-2 text-[14px] font-semibold text-ink-2">
                    {describePosition(pos.metres, "it").phrase} · km{" "}
                    {(pos.metres / 1000).toFixed(2).replace(".", ",")} de{" "}
                    {(COURSE.lengthMetres / 1000).toFixed(1).replace(".", ",")}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[15px] font-semibold text-ink-3">Todavía no reporta</p>
              )}
              <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[13px]">
                {assigned.length === 0 ? (
                  <li className="font-semibold text-warn-text">Nadie asignado a este rol</li>
                ) : (
                  assigned.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2 text-ink-2">
                      <span className="truncate">{r.name}</span>
                      <span className="shrink-0 text-ink-3">
                        {r.lastSignalTs ? timeAgo(r.lastSignalTs, now) : "never"}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </article>
          );
        })}
      </section>

      <section className={`${CARD_CLASS} p-0 overflow-hidden`}>
        {correcting && (
          <p className="bg-ink px-4 py-2.5 text-[14px] font-bold text-paper">
            Tocá en el mapa dónde va la {POST_NAME[correcting].toLowerCase()}.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => setCorrecting(null)}>
              Cancelar
            </button>
          </p>
        )}
        <div className="relative h-[420px]">
          <ParadeMap
            state={state}
            points={[]}
            density={null}
            pickedPoint={null}
            onPointClick={() => undefined}
            location={null}
            now={now}
            pickingPoint={correcting !== null}
            onPointPicked={(lat, lng) => void correct(lat, lng)}
            framing={null}
          />
        </div>
        {state?.positions.head && state.positions.tail && state.positions.head.metres > state.positions.tail.metres ? (
          <p className="px-5 py-3 text-[14px] text-ink-2">
            Largo del desfile:{" "}
            <b>{shortDistance(state.positions.head.metres - state.positions.tail.metres)}</b> entre la
            cabeza y la cola.
          </p>
        ) : null}
      </section>

      <AnnouncementsAdmin announcements={state?.announcements ?? []} onAnswer={handle} />
    </div>
  );
}

function AnnouncementsAdmin({
  announcements,
  onAnswer,
}: {
  announcements: { id: string; text: string; level: string; expiresAt: number | null }[];
  onAnswer: (r: { ok: boolean; error?: string; status?: number }) => void;
}) {
  const [text, setText] = useState("");
  const [level, setLevel] = useState("info");
  const [durationMin, setDuration] = useState(60);

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api("/api/admin/avisos", { method: "POST", body: JSON.stringify({ text, level, durationMin }) });
    onAnswer(r);
    if (r.ok) setText("");
  };

  return (
    <section className={CARD_CLASS}>
      <p className="text-[15px] font-extrabold text-ink">Mensaje para todos</p>
      <p className="mt-1 text-[13px] text-ink-3">
        Sale arriba del mapa de todo el que tenga la app abierta. Para cosas como «arranca con 40 min
        de retraso» o «desvío por la carrera 27». Se quita solo cuando vence.
      </p>
      <form onSubmit={publish} className="mt-3 flex flex-wrap items-end gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={160}
          placeholder="Escribí el mensaje (máx. 160 letras)"
          aria-label="Mensaje"
          className={`${INPUT_CLASS} mt-0 min-w-64 flex-1`}
        />
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Tipo" className={`${INPUT_CLASS} mt-0 w-auto`}>
          <option value="info">Información</option>
          <option value="alert">Alerta (rojo)</option>
        </select>
        <select
          value={durationMin}
          onChange={(e) => setDuration(Number(e.target.value))}
          aria-label="Duración"
          className={`${INPUT_CLASS} mt-0 w-auto`}
        >
          <option value={30}>30 min</option>
          <option value={60}>1 hora</option>
          <option value={180}>3 horas</option>
          <option value={720}>12 horas</option>
        </select>
        <PrimaryButton disabled={!text.trim()}>Publicar</PrimaryButton>
      </form>
      {announcements.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-line pt-3">
          {announcements.map((a) => (
            <li key={a.id} className="flex items-center gap-3 text-[14px]">
              <span className={`size-2.5 shrink-0 rounded-full ${a.level === "alert" ? "bg-alert" : "bg-ink"}`} aria-hidden />
              <span className="min-w-0 flex-1 text-ink">{a.text}</span>
              <SecondaryButton
                danger
                onClick={async () => onAnswer(await api(`/api/admin/avisos/${a.id}`, { method: "DELETE" }))}
              >
                Quitar
              </SecondaryButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
