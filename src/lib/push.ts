import { sendNotification, setVapidDetails } from "web-push";

import { datos } from "@/lib/datos";
import { estimarVelocidad } from "@/lib/eta";
import type { EstadoDesfile } from "@/lib/tipos";

/**
 * Avisos "el desfile está cerca".
 *
 * La persona marca dónde espera, pide el aviso y guarda el celular. Cada vez
 * que llega una posición de la cabeza se revisa a quién le falta poco, se le
 * manda la notificación y su suscripción se borra: un aviso por pedido.
 *
 * Necesita llaves VAPID (`npm run push:llaves`). Sin ellas la función se apaga
 * sola y la app usa el aviso local, que solo suena con la app abierta.
 */

export const VAPID_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLICA ?? "";

let configurado: boolean | null = null;

export function pushConfigurado(): boolean {
  if (configurado !== null) return configurado;
  const privada = process.env.VAPID_PRIVADA;
  if (!VAPID_PUBLICA || !privada) return (configurado = false);
  try {
    setVapidDetails(process.env.VAPID_CONTACTO || "mailto:soporte@example.com", VAPID_PUBLICA, privada);
    return (configurado = true);
  } catch (e) {
    console.error("[push] llaves VAPID inválidas:", e);
    return (configurado = false);
  }
}

/** Para no revisar miles de suscripciones con cada punto: como mucho una vez cada 15 s por desfile. */
const ultimaRevision = new Map<string, number>();
const CADA_MS = 15_000;

/**
 * Se llama después de guardar posiciones de la cabeza. No lanza: un fallo
 * mandando avisos no puede tumbar la ingesta.
 */
export async function avisarCercanos(estado: EstadoDesfile): Promise<void> {
  if (!pushConfigurado()) return;
  const cabeza = estado.posiciones.cabeza;
  if (!cabeza) return;
  const ahora = Date.now();
  if (ahora - (ultimaRevision.get(estado.desfileId) ?? 0) < CADA_MS) return;
  ultimaRevision.set(estado.desfileId, ahora);

  try {
    const vel = estimarVelocidad(estado.historialCabeza, ahora);
    if (vel.detenido) return; // detenido no "está por llegar": se avisa cuando arranque
    const subs = await datos().listarSuscripciones(estado.desfileId);

    await Promise.allSettled(
      subs.map(async (s) => {
        const falta = s.metros - cabeza.metros;
        const minutos = falta / vel.ms / 60;
        if (falta > 0 && minutos > s.umbralMin) return; // todavía no
        // Ya le toca (o ya le pasó): en ambos casos la suscripción se gasta.
        await datos().eliminarSuscripcion(s.endpoint);
        if (falta <= 0) return;
        const cuerpo =
          minutos < 3
            ? "Ya casi llega a donde estás. ¡Alistá la cámara!"
            : `Le faltan unos ${Math.max(5, Math.round(minutos / 5) * 5)} min para llegar a donde estás.`;
        try {
          await sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ titulo: `${estado.nombre}: ya viene`, cuerpo, url: "/" }),
            { TTL: 600, urgency: "high" },
          );
        } catch {
          // Suscripción vencida o servicio de push caído: ya se borró, no hay reintento.
        }
      }),
    );
  } catch (e) {
    console.error("[push] no se pudieron revisar los avisos:", e);
  }
}
