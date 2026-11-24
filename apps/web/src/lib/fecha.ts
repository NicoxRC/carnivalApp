/**
 * Fechas y horas en hora de Pasto.
 *
 * `new Date().toISOString()` da la fecha en UTC: desde las 7 p. m. en Pasto ya
 * es "mañana". Y `getHours()` usa la zona del celular, que para un turista
 * puede ser otra. Todo lo que diga "hoy" o "ahora" pasa por aquí.
 */
const ZONA = "America/Bogota";

const fmtFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** YYYY-MM-DD de hoy (o de `ts`) en Pasto. */
export function hoyEnPasto(ts: number = Date.now()): string {
  return fmtFecha.format(new Date(ts));
}

/** Minutos transcurridos del día en Pasto: 9:30 a. m. → 570. */
export function minutosDelDiaEnPasto(ts: number = Date.now()): number {
  const [h, m] = fmtHora.format(new Date(ts)).split(":").map(Number);
  return h * 60 + m;
}

export function minutosDeHora(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

const DIAS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Partes para pintar una fecha YYYY-MM-DD sin pasar por zonas horarias. */
export function partesDeFecha(fecha: string): { diaCorto: string; diaNumero: string; largo: string } {
  const [a, m, d] = fecha.split("-").map(Number);
  // Mediodía UTC: el día de la semana no cambia con ninguna zona.
  const dia = new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
  return { diaCorto: DIAS[dia], diaNumero: String(d), largo: `${d} de ${MESES[m - 1]}` };
}

export const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const ES_HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** "9:00" → "09:00", para que ordenar como texto funcione. */
export function normalizarHora(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}
