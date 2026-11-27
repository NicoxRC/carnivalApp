"use client";

import { useCallback, useSyncExternalStore } from "react";

import { translate, type Language, type Translator } from "@/lib/i18n-texts";

export type { TextKey, Language, Translator } from "@/lib/i18n-texts";

const KEY = "sed:idioma";
const listeners = new Set<() => void>();
let current: Language | null = null;

function read(): Language {
  if (current) return current;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "es" || saved === "en") return (current = saved);
  } catch {}
  return (current = navigator.language?.toLowerCase().startsWith("es") ? "es" : "en");
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setLanguage(language: Language) {
  current = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {}
  document.documentElement.lang = language === "es" ? "es-CO" : "en";
  for (const cb of listeners) cb();
}

export function useLanguage(): { language: Language; t: Translator } {
  const language = useSyncExternalStore<Language>(subscribe, read, () => "es");
  const t = useCallback<Translator>((key, vars) => translate(language, key, vars), [language]);
  return { language, t };
}
