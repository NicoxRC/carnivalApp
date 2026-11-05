"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Los cuatro iconos del diseño, como trazo de 2px sobre 24×24. */
const ICONOS: Record<string, React.ReactNode> = {
  mapa: <path d="M9 20l-5.5 2V6L9 4m0 16l6-2m-6 2V4m6 14l5.5 2V4l-5.5 2m0 12V6m0 0L9 4" />,
  hoy: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  desfiles: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </>
  ),
  fotos: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
};

const TABS = [
  { href: "/", etiqueta: "Mapa", icono: "mapa" },
  { href: "/hoy", etiqueta: "Hoy", icono: "hoy" },
  { href: "/desfiles", etiqueta: "Desfiles", icono: "desfiles" },
  { href: "/fotos", etiqueta: "Fotos", icono: "fotos" },
];

export function Navegacion() {
  const ruta = usePathname();

  return (
    <nav
      className={
        // Móvil: barra inferior pegada, dentro del área segura.
        "pb-seguro sticky bottom-0 z-30 border-t border-borde bg-blanco " +
        // Escritorio: riel de 92 px a la izquierda, alto completo y fijo.
        "lg:top-0 lg:h-dvh lg:w-[92px] lg:shrink-0 lg:border-t-0 lg:border-r lg:pb-0"
      }
    >
      <ul className="mx-auto flex max-w-lg px-1 pt-1.5 lg:mx-0 lg:max-w-none lg:flex-col lg:gap-1 lg:px-2 lg:pt-4">
        {TABS.map((t) => {
          const activo = ruta === t.href;
          return (
            <li key={t.href} className="flex-1 lg:flex-none">
              <Link
                href={t.href}
                aria-current={activo ? "page" : undefined}
                className="flex flex-col items-center gap-[3px] rounded-xl py-2 lg:py-3 lg:hover:bg-papel-2"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={activo ? "var(--color-cabeza)" : "var(--color-tinta-4)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {ICONOS[t.icono]}
                </svg>
                <span
                  className={`text-[11px] ${
                    activo ? "font-extrabold text-cabeza" : "font-bold text-tinta-4"
                  }`}
                >
                  {t.etiqueta}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
