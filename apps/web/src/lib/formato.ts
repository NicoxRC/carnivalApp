import { minutosDeHora } from "@/lib/fecha";
import { traducir, type Traductor } from "@/lib/i18n-textos";

const enEspanol: Traductor = (clave, vars) => traducir("es", clave, vars);

/** Siempre mostrar el último dato conocido con su hora, nunca un spinner infinito. */
export function haceCuanto(ts: number, ahora: number, t: Traductor = enEspanol): string {
  const s = Math.max(0, Math.round((ahora - ts) / 1000));
  if (s < 10) return t("t.ahora");
  if (s < 60) return t("t.haceS", { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t("t.haceMin", { n: m });
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? t("t.haceH", { h }) : t("t.haceHMin", { h, n: resto });
}

export function horaCorta(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    // Siempre la hora de Pasto: un turista con el celular en otra zona vería
    // "pasó a las 4:42" cuando en la senda eran las 10:42.
    timeZone: "America/Bogota",
  });
}

export function distanciaCorta(metros: number): string {
  if (metros < 950) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

/** "14:30" → "2:30 p. m." */
export function horaDelDia(hhmm: string): string {
  const min = minutosDeHora(hhmm);
  const h = Math.floor(min / 60);
  const m = String(min % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
}
