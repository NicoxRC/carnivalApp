"use client";

/**
 * Primera pantalla: explica qué es la app antes de pedirle la ubicación a nadie.
 *
 * El usuario primerizo es el caso normal aquí — la app se usa 6 días al año y
 * nadie recuerda cómo funcionaba. Pedir el permiso de GPS a bocajarro, sin haber
 * dicho para qué, es la forma más rápida de que lo nieguen.
 */
export function Inicio({
  onSeguir,
  onSaltar,
}: {
  onSeguir: () => void;
  onSaltar: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-marca">
      {/* Serpentinas */}
      <svg
        className="pointer-events-none absolute -top-10 -left-8 opacity-90"
        width="375"
        height="360"
        viewBox="0 0 375 360"
        fill="none"
        aria-hidden
      >
        <g stroke="#4fa8dd" strokeWidth="18" strokeLinecap="round">
          <line x1="-10" y1="20" x2="120" y2="150" />
          <line x1="80" y1="-20" x2="150" y2="120" />
          <line x1="200" y1="-30" x2="200" y2="110" />
          <line x1="320" y1="-20" x2="230" y2="120" />
          <line x1="410" y1="30" x2="270" y2="150" />
        </g>
      </svg>

      <div className="pt-seguro relative flex flex-1 flex-col overflow-y-auto px-7 pb-8">
        <p className="mt-12 text-xs font-extrabold tracking-[2.4px] text-[#bfe0f2] uppercase">
          Carnaval de Negros y Blancos
        </p>

        <h1 className="fuente-display mt-3.5 text-[52px] leading-[0.98] text-papel">
          Sigue el
          <br />
          Desfile
        </h1>

        <p className="mt-4 max-w-[300px] text-[17px] leading-normal text-[#e4f1fa]">
          Enterate por dónde va el desfile ahora mismo y cuánto le falta pa&apos; llegar a
          donde estás parado. Sin moverte del puesto, ¿sí o qué pues?
        </p>

        <div className="mt-6 flex flex-col gap-4 rounded-[20px] border border-white/20 bg-white/10 p-4">
          <div className="flex items-center gap-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-papel" aria-hidden>
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-marca)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 20l-5.5 2V6L9 4m0 16l6-2m-6 2V4m6 14l5.5 2V4l-5.5 2m0 12V6m0 0L9 4" />
              </svg>
            </span>
            <p className="text-[15px] leading-tight text-papel">
              <b className="text-base">Mapa</b> — seguí el desfile en vivo, con tarimas y
              tascas.
            </p>
          </div>

          <div className="flex items-center gap-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-papel" aria-hidden>
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-cabeza)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.2" />
              </svg>
            </span>
            <p className="text-[15px] leading-tight text-papel">
              <b className="text-base">Hoy, Desfiles y Fotos</b> — todo lo del Carnaval en un
              solo puesto.
            </p>
          </div>
        </div>

        <div className="mt-auto pt-8">
          <button
            type="button"
            onClick={onSeguir}
            className="flex h-[60px] w-full items-center justify-center gap-2.5 rounded-2xl bg-cabeza text-[19px] font-extrabold text-white shadow-[0_12px_24px_-10px_rgba(234,90,18,0.7)] active:opacity-90"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden>
              <path d="M6 3l12 9-12 9z" />
            </svg>
            Seguir el desfile
          </button>

          <button
            type="button"
            onClick={onSaltar}
            className="mt-3.5 w-full text-center text-sm text-[#cfe6f4] underline-offset-4 active:underline"
          >
            Ver primero sin ubicación
          </button>
        </div>
      </div>
    </div>
  );
}
