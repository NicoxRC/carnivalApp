"use client";

import { useEffect, useState } from "react";

import { LoginForm } from "@/components/LoginForm";
import type { SessionUser } from "@/lib/api/auth";

import { shortDistance, timeAgo } from "@/lib/format";
import { useClock } from "@/lib/hooks/useParadeState";
import { SEND_INTERVAL_MS, ACCEPTABLE_ACCURACY_M, useReporting, type Reporting } from "@/lib/hooks/useReporting";
import { projectOnCourse, describePosition, COURSE } from "@/lib/course";
import { useSession } from "@/lib/hooks/useSession";
import type { Post } from "@/lib/types";

const POST_LABEL: Record<Post, { name: string; color: string; help: string }> = {
  head: { name: "Cabeza", color: "bg-head", help: "Caminá con la primera carroza o comparsa." },
  middle: { name: "Mitad", color: "bg-middle", help: "Caminá a la mitad del desfile." },
  tail: { name: "Cola", color: "bg-tail", help: "Caminá con lo último del desfile." },
};

export function ReporterPanel() {
  const { session, retry, loggedIn, logOut, expired } = useSession();

  return (
    <div className="pt-safe pb-safe min-h-dvh bg-ink text-paper">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
        {session.state === "loading" ? (
          <p className="m-auto text-sm text-ink-4">Cargando…</p>
        ) : session.state === "offline" ? (
          <div className="m-auto text-center">
            <p className="text-[15px] text-ink-4">Sin conexión con el servidor.</p>
            <button type="button" onClick={retry} className="mt-4 rounded-full bg-paper px-6 py-3 font-bold text-ink">
              Probar otra vez
            </button>
          </div>
        ) : session.state === "out" ? (
          <div className="my-auto">
            <p className="display-font text-[28px] leading-tight">Panel de reporteros</p>
            <p className="mt-2 text-[15px] text-ink-4">Entrá con el correo y la contraseña que te dio el coordinador.</p>
            <LoginForm tone="dark" expired={session.expired} onLoggedIn={loggedIn} />
          </div>
        ) : session.user.post === null || !session.user.permissions.includes("positions:own") ? (
          <NoPost user={session.user} onLogOut={logOut} />
        ) : (
          <ReportingView user={session.user} post={session.user.post} onLogOut={logOut} onExpired={expired} />
        )}
      </div>
    </div>
  );
}

function NoPost({ user, onLogOut }: { user: SessionUser; onLogOut: () => void }) {
  return (
    <div className="my-auto">
      <p className="display-font text-[24px] leading-tight">Tu usuario no tiene un puesto asignado</p>
      <p className="mt-3 text-[15px] text-ink-4">
        {user.name}: pedile al coordinador que te asigne cabeza, mitad o cola.
      </p>
      <button
        type="button"
        onClick={onLogOut}
        className="mt-6 rounded-full border border-ink-2 px-5 py-2.5 text-[14px] font-bold text-ink-4"
      >
        Salir
      </button>
    </div>
  );
}

function ReportingView({
  user,
  post: userPost,
  onLogOut,
  onExpired,
}: {
  user: SessionUser;
  post: Post;
  onLogOut: () => void;
  onExpired: () => void;
}) {
  const r = useReporting(onExpired);
  const now = useClock(1000);
  const post = POST_LABEL[userPost];
  const [safe, setSafe] = useState(true);
  useEffect(() => setSafe(window.isSecureContext), []);

  const logOut = () => {
    r.stop();
    onLogOut();
  };

  return (
    <>
      <header className="flex items-center gap-3">
        <span className={`size-4 shrink-0 rounded-full ${post.color}`} aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink-4">
            {user.name}
          </p>
          <p className="display-font text-[24px] leading-none">{post.name}</p>
        </div>
        {r.active ? null : (
          <button
            type="button"
            onClick={logOut}
            className="ml-auto rounded-full border border-ink-2 px-3 py-1.5 text-[13px] font-bold text-ink-4"
          >
            Salir
          </button>
        )}
      </header>

      {r.active ? (
        <ActiveReporting r={r} now={now} />
      ) : (
        <div className="my-auto">
          <p className="text-[17px] leading-snug text-paper">{post.help}</p>
          <ul className="mt-4 space-y-2 text-[15px] leading-snug text-ink-4">
            <li>· Dejá esta pantalla abierta todo el recorrido. Tu ubicación sale sola.</li>
            <li>· Si el desfile se para o arranca, tocá «Estoy aquí».</li>
            <li>· Llevá batería externa: la pantalla va a estar encendida.</li>
          </ul>
          {r.gps === "denied" || r.gps === "error" ? <GpsNotice gps={r.gps} /> : null}
          {safe ? null : (
            <p className="mt-4 rounded-2xl bg-[#3a1512] px-4 py-3 text-[14px] font-semibold text-[#ff8a7a]">
              Esta página no está abierta por una conexión segura (https), y así el celular no
              entrega el GPS. Abrila desde la dirección oficial de la app.
            </p>
          )}
          <button
            type="button"
            onClick={r.start}
            className="mt-8 w-full rounded-full bg-ok py-5 text-xl font-extrabold text-white active:opacity-90"
          >
            Empezar a reportar
          </button>
        </div>
      )}
    </>
  );
}

function ActiveReporting({ r, now }: { r: Reporting; now: number }) {
  const [alert, setAlert] = useState<string | null>(null);
  const [waypoint, setWaypoint] = useState("");

  const projection = r.fix ? projectOnCourse(r.fix.lat, r.fix.lng) : null;
  const reference = projection ? describePosition(projection.metres, "you").phrase : null;
  const far = projection !== null && projection.offsetM > 150;

  const late = r.lastSentAt !== null && now - r.lastSentAt > SEND_INTERVAL_MS * 3;
  const imprecise = r.fix !== null && r.fix.accuracyM > ACCEPTABLE_ACCURACY_M;

  const tapImHere = () => {
    setAlert(r.imHere() ? "Listo, ya saben por dónde vas." : "Todavía no hay GPS. Usá la lista de abajo.");
    setTimeout(() => setAlert(null), 4000);
  };

  return (
    <div className="mt-6 flex flex-1 flex-col gap-4">
      <section className="rounded-3xl bg-[#202024] p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <span
            className={`size-2.5 rounded-full ${
              r.network === "ok" && !late ? "heartbeat bg-ok" : "bg-middle"
            }`}
            aria-hidden
          />
          {r.network === "no_signal"
            ? "Sin señal: se guarda y se manda cuando vuelva"
            : r.onHold
              ? "De respaldo: otro reportero lleva este rol"
              : late
              ? "Hace rato no sale nada"
              : "Mandando tu ubicación"}
        </p>
        <p className="display-font mt-3 text-[30px] leading-none">
          {r.lastSentAt ? timeAgo(r.lastSentAt, now) : "—"}
        </p>
        <p className="mt-1 text-[13px] text-ink-4">último envío</p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-ink-4">GPS</dt>
            <dd className="font-bold">
              {r.gps === "ok" && r.fix
                ? `± ${Math.round(r.fix.accuracyM)} m`
                : r.gps === "searching"
                  ? "buscando…"
                  : "sin GPS"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-4">Por mandar</dt>
            <dd className="font-bold">{r.pending === 0 ? "none" : `${r.pending} puntos`}</dd>
          </div>
        </dl>
        {reference ? (
          <p className="mt-3 text-[15px] font-semibold">
            {far ? `Estás a ${shortDistance(projection.offsetM)} de la senda` : reference}
          </p>
        ) : null}
      </section>

      {r.gps === "denied" || r.gps === "error" ? <GpsNotice gps={r.gps} /> : null}

      {r.onHold ? (
        <p className="rounded-2xl bg-[#1d2a3a] px-4 py-3 text-[14px] font-semibold text-[#9fd0f5]">
          Otra persona con tu mismo rol está mandando su ubicación, así que la tuya no se usa por
          ahora. Dejá el panel abierto: si la otra se queda sin señal un minuto, entrás vos solo.
        </p>
      ) : null}

      {imprecise ? (
        <p className="rounded-2xl bg-[#3a2a10] px-4 py-3 text-[14px] font-semibold text-middle">
          El GPS está muy impreciso (± {Math.round(r.fix!.accuracyM)} m) y así no se manda. Salí a
          cielo abierto, o marcá por punto de referencia abajo.
        </p>
      ) : null}

      {r.screenOn === false ? (
        <p className="rounded-2xl bg-[#3a2a10] px-4 py-3 text-[14px] font-semibold text-middle">
          La pantalla se puede apagar sola y entonces deja de mandar. Tocá la pantalla de vez en
          cuando o subí el tiempo de bloqueo del celular.
        </p>
      ) : r.screenOn === null ? (
        <p className="rounded-2xl bg-[#3a2a10] px-4 py-3 text-[14px] font-semibold text-middle">
          Este navegador no deja mantener la pantalla encendida. Poné el bloqueo automático del
          celular en «Nunca» mientras reportas.
        </p>
      ) : null}

      <button
        type="button"
        onClick={tapImHere}
        className="mt-auto w-full rounded-[28px] bg-head py-7 text-[26px] font-extrabold text-white shadow-[0_10px_30px_-10px_rgba(255,106,31,0.6)] active:scale-[0.99]"
      >
        Estoy aquí
      </button>
      <p className="-mt-2 text-center text-[13px] text-ink-4" aria-live="polite">
        {alert ?? "Tocalo cuando el desfile se pare o vuelva a arrancar."}
      </p>

      <details className="rounded-2xl bg-[#202024] px-4 py-3">
        <summary className="cursor-pointer text-[15px] font-bold">¿El GPS no funciona? Marcá por dónde vas</summary>
        <div className="mt-3 flex gap-2">
          <select
            value={waypoint}
            onChange={(e) => setWaypoint(e.target.value)}
            className="min-w-0 flex-1 rounded-xl bg-ink px-3 py-3 text-[15px] text-paper"
            aria-label="Punto de referencia"
          >
            <option value="">Elegí el punto más cercano…</option>
            {COURSE.waypoints.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!waypoint}
            onClick={() => {
              r.markWaypoint(waypoint);
              setAlert("Listo, marcado por el punto de referencia.");
              setWaypoint("");
              setTimeout(() => setAlert(null), 4000);
            }}
            className="rounded-xl bg-paper px-4 font-extrabold text-ink disabled:opacity-40"
          >
            Marcar
          </button>
        </div>
      </details>

      <button
        type="button"
        onClick={() => {
          if (confirm("¿Terminar? Tu ubicación deja de mandarse.")) r.stop();
        }}
        className="w-full rounded-full border border-ink-2 py-3 text-[15px] font-bold text-ink-4"
      >
        Terminar el recorrido
      </button>
    </div>
  );
}

function GpsNotice({ gps }: { gps: "denied" | "error" }) {
  return (
    <p className="mt-4 rounded-2xl bg-[#3a1512] px-4 py-3 text-[14px] font-semibold text-[#ff8a7a]">
      {gps === "denied"
        ? "No diste permiso de ubicación. Activalo en los ajustes del navegador para este sitio, o marcá por punto de referencia."
        : "No se pudo leer el GPS. Revisá que la ubicación del celular esté prendida."}
    </p>
  );
}
