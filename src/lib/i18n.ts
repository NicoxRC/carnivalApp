"use client";

import { useCallback, useSyncExternalStore } from "react";

import { traducir, type Idioma, type Traductor } from "@/lib/i18n-textos";

export type { ClaveTexto, Idioma, Traductor } from "@/lib/i18n-textos";

/** El idioma elegido, compartido por toda la app. Los textos viven en `i18n-textos.ts`. */

const CLAVE = "sed:idioma";
const oyentes = new Set<() => void>();
let actual: Idioma | null = null;

function leer(): Idioma {
  if (actual) return actual;
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === "es" || guardado === "en") return (actual = guardado);
  } catch {
    // sin almacenamiento: se decide por el idioma del celular
  }
  // Solo se cambia a inglés si el celular NO está en español: un pastuso con
  // el teléfono en español nunca debería ver la app en inglés por accidente.
  return (actual = navigator.language?.toLowerCase().startsWith("es") ? "es" : "en");
}

function suscribir(cb: () => void) {
  oyentes.add(cb);
  return () => oyentes.delete(cb);
}

export function fijarIdioma(idioma: Idioma) {
  actual = idioma;
  try {
    localStorage.setItem(CLAVE, idioma);
  } catch {
    // vale para esta sesión
  }
  document.documentElement.lang = idioma === "es" ? "es-CO" : "en";
  for (const cb of oyentes) cb();
}

/**
 * En el servidor y en el primer render se usa español (lo que está en el HTML
 * prerenderizado); el idioma real se aplica al hidratar, sin desajuste.
 */
export function useIdioma(): { idioma: Idioma; t: Traductor } {
  const idioma = useSyncExternalStore<Idioma>(suscribir, leer, () => "es");
  const t = useCallback<Traductor>((clave, vars) => traducir(idioma, clave, vars), [idioma]);
  return { idioma, t };
}
