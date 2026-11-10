import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Navegacion } from "@/components/Navegacion";
import { RegistrarSW } from "@/components/RegistrarSW";

export const metadata: Metadata = {
  title: "Sigue el Desfile",
  description:
    "Dónde va el desfile del Carnaval de Negros y Blancos, en vivo, y cuánto falta para que llegue a donde estás.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Sigue el Desfile" },
  // iOS no acepta SVG para el ícono de la pantalla de inicio.
  icons: { icon: "/icono.svg", apple: "/icono-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#eceae2",
  width: "device-width",
  initialScale: 1,
  // Sin `maximumScale`: bloquear el zoom deja fuera a quien necesita agrandar
  // el texto. MapLibre ya captura sus propios gestos dentro del mapa.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="min-h-dvh bg-papel-3 text-tinta antialiased">
        {/* Móvil: contenido arriba, pestañas abajo (pulgar). Escritorio: riel
            lateral fijo, porque una barra de pestañas de 1.500 px de ancho con
            cuatro iconos centrados no la usa nadie. */}
        <div className="flex min-h-dvh flex-col lg:flex-row">
          <main className="relative flex flex-1 flex-col lg:order-last lg:min-w-0">
            {children}
          </main>
          <Navegacion />
        </div>
        <RegistrarSW />
      </body>
    </html>
  );
}
