import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { resolverBaseApi } from "./src/lib/api/cliente";

const enDesarrollo = process.env.NODE_ENV !== "production";

/** El backend. Sin él la web no tiene datos (ver `src/lib/api/cliente.ts`). */
const baseApi = resolverBaseApi(process.env.NEXT_PUBLIC_API_URL, enDesarrollo);
const origenApi = baseApi ? new URL(baseApi).origin : "";

/**
 * Política de contenido. Todo sale de nuestro dominio (mapa, fuentes) salvo
 * los datos, que vienen del backend: su origen va en `connect-src`. Dos
 * concesiones:
 *  - 'unsafe-inline' en scripts: Next inyecta scripts en línea para hidratar.
 *    Quitarlo exige nonces por petición, que obligan a renderizar todo en
 *    dinámico; queda pendiente.
 *  - blob: en workers: MapLibre arma su worker así.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${origenApi ? ` ${origenApi}` : ""}${enDesarrollo ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig = (fase: string): NextConfig => {
  // Un despliegue sin la dirección del backend saldría sin datos (o apuntando
  // a localhost): mejor que el build falle y lo diga.
  if (fase === PHASE_PRODUCTION_BUILD && !baseApi) {
    throw new Error("Falta NEXT_PUBLIC_API_URL: la dirección del backend (por ejemplo https://api.tu-dominio.co).");
  }
  return config;
};

const config: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Que nadie meta la app (ni el panel de admin) dentro de un iframe.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // El service worker debe poder controlar toda la app.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
