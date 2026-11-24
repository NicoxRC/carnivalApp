import { urlApi } from "@/lib/api/cliente";
import { metricaParaApi } from "@/lib/api/comercios";
import type { TipoMetrica } from "@/lib/tipos";

/**
 * Cuenta una interacción con un comercio. Es lo que se le reporta al anunciante.
 * `keepalive` para que el toque en WhatsApp se cuente aunque la app pase a
 * segundo plano en ese mismo instante. Si falla, no importa: es un contador.
 *
 * Va a otro origen con cuerpo JSON, así que el navegador hace antes una
 * consulta CORS; algún navegador viejo no deja `keepalive` con ella y ese
 * conteo se pierde. Se acepta: es una métrica de interés, no de cobro.
 */
export function contarMetrica(id: string, tipo: TipoMetrica) {
  try {
    void fetch(urlApi("/api/businesses/event"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metricaParaApi(id, tipo)),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Sin URL del API o tipo desconocido: no se cuenta, la pantalla sigue.
  }
}
