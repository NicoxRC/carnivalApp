/**
 * Dónde está el backend (`apps/backend/`) y cómo se le pide algo.
 *
 * La web y el API viven en orígenes distintos: el navegador solo deja hablar
 * con el API porque este lo autoriza (CORS) y porque la CSP de `next.config.ts`
 * lo incluye en `connect-src`.
 */

/** Sin `NEXT_PUBLIC_API_URL`, en desarrollo se usa el backend de `just dev`. */
export const API_DESARROLLO = "http://localhost:8000";

/**
 * La base del API, sin barra final. `null` si no está configurada: en
 * producción no hay valor por defecto, para no salir apuntando a localhost
 * (`next build` falla antes, ver `next.config.ts`).
 */
export function resolverBaseApi(valor: string | undefined, desarrollo: boolean): string | null {
  const limpio = valor?.trim().replace(/\/+$/, "");
  if (limpio) return limpio;
  return desarrollo ? API_DESARROLLO : null;
}

export const BASE_API = resolverBaseApi(
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NODE_ENV !== "production",
);

export function urlApi(ruta: string, base: string | null = BASE_API): string {
  if (!base) throw new Error("Falta NEXT_PUBLIC_API_URL: la web no sabe dónde está el backend.");
  return `${base}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
}

/** Una respuesta que no es 2xx, con el mensaje que manda el backend. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

/**
 * `fetch` contra el API. Si la respuesta no es 2xx lanza `ErrorApi` con el
 * mensaje del backend (`{"error": "..."}`, en español). Una falla de red se
 * propaga tal cual: quien llama decide si reintenta.
 */
export async function pedirApi(ruta: string, init?: RequestInit): Promise<Response> {
  const respuesta = await fetch(urlApi(ruta), init);
  if (respuesta.ok) return respuesta;
  let mensaje = `Error ${respuesta.status}`;
  try {
    const cuerpo: unknown = await respuesta.json();
    if (cuerpo && typeof cuerpo === "object" && typeof (cuerpo as { error?: unknown }).error === "string") {
      mensaje = (cuerpo as { error: string }).error;
    }
  } catch {
    // Sin cuerpo JSON: queda el código.
  }
  throw new ErrorApi(respuesta.status, mensaje);
}
