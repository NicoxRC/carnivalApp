import type { Aviso } from "@/lib/tipos";

/**
 * Mensajes del equipo para todo el mundo: «arranca con 40 min de retraso»,
 * «desvío por la carrera 27». Salen tal como los escribió el administrador.
 */
export function Avisos({ avisos }: { avisos: Aviso[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="space-y-1.5" role="status">
      {avisos.map((a) => (
        <li
          key={a.id}
          className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug font-semibold shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] ${
            a.nivel === "alerta" ? "bg-alerta text-white" : "bg-tinta text-papel"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
            <path d="M4 10v4h3l6 4V6l-6 4zM17 9a4 4 0 0 1 0 6" />
          </svg>
          <span>{a.texto}</span>
        </li>
      ))}
    </ul>
  );
}
