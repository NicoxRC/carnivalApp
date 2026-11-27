import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { resolveApiBase } from "./src/lib/api/client";

const isDev = process.env.NODE_ENV !== "production";

const apiBase = resolveApiBase(process.env.NEXT_PUBLIC_API_URL, isDev);
const apiOrigin = apiBase ? new URL(apiBase).origin : "";
const photosOrigin = process.env.NEXT_PUBLIC_PHOTOS_ORIGIN?.trim() || "https://*.r2.cloudflarestorage.com";
const photoSources = [apiOrigin, photosOrigin].filter(Boolean).join(" ");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${photoSources}`,
  "font-src 'self'",
  `connect-src 'self' ${photoSources}${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig = (phase: string): NextConfig => {
  if (phase === PHASE_PRODUCTION_BUILD && !apiBase) {
    throw new Error("NEXT_PUBLIC_API_URL is missing: the backend address (for example https://api.your-domain.co).");
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
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
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
