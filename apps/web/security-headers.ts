import { resolveApiBase } from "./src/lib/api/client";

export type Header = { key: string; value: string };

export function apiBaseFromEnv(isDev: boolean): string | null {
  return resolveApiBase(process.env.NEXT_PUBLIC_API_URL, isDev);
}

export function securityHeaders(apiBase: string | null, isDev: boolean): Header[] {
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
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  ];
}

export const SERVICE_WORKER_HEADERS: Header[] = [
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  { key: "Service-Worker-Allowed", value: "/" },
];

export function cloudflareHeadersFile(apiBase: string | null): string {
  const block = (path: string, headers: Header[]) =>
    [path, ...headers.map((h) => `  ${h.key}: ${h.value}`)].join("\n");
  return `${block("/*", securityHeaders(apiBase, false))}\n\n${block("/sw.js", SERVICE_WORKER_HEADERS)}\n`;
}
