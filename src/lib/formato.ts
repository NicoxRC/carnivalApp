/** Siempre mostrar el último dato conocido con su hora, nunca un spinner infinito. */
export function haceCuanto(ts: number, ahora: number): string {
  const s = Math.max(0, Math.round((ahora - ts) / 1000));
  if (s < 10) return "ahora mismo";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `hace ${h} h` : `hace ${h} h ${resto} min`;
}

export function horaCorta(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function distanciaCorta(metros: number): string {
  if (metros < 950) return `${Math.round(metros / 10) * 10} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

export function horaDelDia(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
}
