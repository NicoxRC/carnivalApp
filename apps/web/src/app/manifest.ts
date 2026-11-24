import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sigue el Desfile — Carnaval de Negros y Blancos",
    short_name: "Sigue el Desfile",
    description:
      "Dónde va el desfile en vivo y cuánto falta para que llegue a donde estás.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // El papel de la app, no el negro del tema oscuro que hubo antes: es el
    // color de la pantalla de arranque al abrirla desde el ícono.
    background_color: "#eceae2",
    theme_color: "#eceae2",
    lang: "es-CO",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
