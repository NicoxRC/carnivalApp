const TIME_ZONE = "America/Bogota";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function todayInPasto(ts: number = Date.now()): string {
  return dateFormat.format(new Date(ts));
}

export function minuteOfDayInPasto(ts: number = Date.now()): number {
  const [h, m] = timeFormat.format(new Date(ts)).split(":").map(Number);
  return h * 60 + m;
}

export function minutesOfTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

const DAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function dateParts(date: string): { shortDay: string; dayNumber: string; long: string } {
  const [a, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
  return { shortDay: DAYS[day], dayNumber: String(d), long: `${d} de ${MONTHS[m - 1]}` };
}

export const IS_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const IS_TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function normalizeTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}
