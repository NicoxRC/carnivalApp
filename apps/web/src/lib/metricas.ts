import type { TipoMetrica } from "@/lib/tipos";

/**
 * Cuenta una interacción con un comercio. Es lo que se le reporta al anunciante.
 * `keepalive` para que el toque en WhatsApp se cuente aunque la app pase a
 * segundo plano en ese mismo instante. Si falla, no importa: es un contador.
 */
export function contarMetrica(id: string, tipo: TipoMetrica) {
  void fetch("/api/comercios/evento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, tipo }),
    keepalive: true,
  }).catch(() => undefined);
}
