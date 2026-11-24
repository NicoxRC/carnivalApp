/**
 * Las posiciones que se mandan al backend (`POST /api/positions`): la
 * `EntradaPosicion` de la web traducida al `PositionInput` del API.
 *
 * No viaja el id del desfile: el backend usa el desfile ACTUAL. El puesto
 * (`post`) solo lo respeta si el usuario tiene `positions:any` (el simulador,
 * un coordinador); a un reportero se lo pone el servidor.
 */

import type { EntradaPosicion, Rol } from "@/lib/tipos";

export type PostApi = "head" | "middle" | "tail";

const POST_DE_ROL: Record<Rol, PostApi> = { cabeza: "head", mitad: "middle", cola: "tail" };

export interface PosicionApi {
  post: PostApi;
  lat: number;
  lng: number;
  accuracyM: number | null;
  ts?: number;
}

export function posicionParaApi(entrada: EntradaPosicion): PosicionApi {
  const post = POST_DE_ROL[entrada.rol];
  if (!post) throw new Error(`Rol desconocido: «${entrada.rol}».`);
  return {
    post,
    lat: entrada.lat,
    lng: entrada.lng,
    accuracyM: entrada.precisionM ?? null,
    ...(entrada.ts !== undefined ? { ts: entrada.ts } : {}),
  };
}
