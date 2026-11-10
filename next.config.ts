import type { NextConfig } from "next";

const enDesarrollo = process.env.NODE_ENV !== "production";

/**
 * Política de contenido. Todo sale de nuestro dominio (mapa, fuentes, fotos),
 * así que la lista es corta. Dos concesiones:
 *  - 'unsafe-inline' en scripts: Next inyecta scripts en línea para hidratar.
 *    Quitarlo exige nonces por petición, que obligan a renderizar todo en
 *    dinámico; queda pendiente.
 *  - blob: en workers: MapLibre arma su worker así.
 */
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${supabase ? ` ${supabase} ${supabase.replace(/^http/, "ws")}` : ""}${enDesarrollo ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
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
      {
        // La senda casi nunca cambia: que el navegador la guarde.
        source: "/api/senda",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
