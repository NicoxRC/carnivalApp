import type { MetadataRoute } from "next";

/** Los paneles del equipo y la API no son para buscadores. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/reportero", "/api/"] }] };
}
