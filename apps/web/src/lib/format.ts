import { minutesOfTime } from "@/lib/dates";
import { translate, type Translator } from "@/lib/i18n-texts";

const inSpanish: Translator = (key, vars) => translate("es", key, vars);

export function timeAgo(ts: number, now: number, t: Translator = inSpanish): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return t("time.now");
  if (s < 60) return t("time.agoS", { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t("time.agoMin", { n: m });
  const h = Math.floor(m / 60);
  const remainder = m % 60;
  return remainder === 0 ? t("time.agoH", { h }) : t("time.agoHMin", { h, n: remainder });
}

export function shortTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

export function shortDistance(metres: number): string {
  if (metres < 950) return `${Math.round(metres / 10) * 10} m`;
  return `${(metres / 1000).toFixed(1).replace(".", ",")} km`;
}

export function timeOfDay(hhmm: string): string {
  const min = minutesOfTime(hhmm);
  const h = Math.floor(min / 60);
  const m = String(min % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "a. m." : "p. m."}`;
}
