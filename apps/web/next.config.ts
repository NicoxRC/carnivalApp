import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { apiBaseFromEnv, SERVICE_WORKER_HEADERS, securityHeaders } from "./security-headers";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig = (phase: string): NextConfig => {
  if (phase === PHASE_PRODUCTION_BUILD) {
    if (!apiBaseFromEnv(false)) {
      throw new Error("NEXT_PUBLIC_API_URL is missing: the backend address (for example https://api.your-domain.co).");
    }
    return { reactStrictMode: true, output: "export" };
  }
  return {
    reactStrictMode: true,
    async headers() {
      return [
        { source: "/:path*", headers: securityHeaders(apiBaseFromEnv(isDev), isDev) },
        { source: "/sw.js", headers: SERVICE_WORKER_HEADERS },
      ];
    },
  };
};

export default nextConfig;
