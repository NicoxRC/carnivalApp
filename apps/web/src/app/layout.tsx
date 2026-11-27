import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "Sigue el Desfile",
  description:
    "Dónde va el desfile del Carnaval de Negros y Blancos, en vivo, y cuánto falta para que llegue a donde estás.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Sigue el Desfile" },
  icons: { icon: "/icono.svg", apple: "/icono-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#eceae2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="min-h-dvh bg-paper-3 text-ink antialiased">
        <div className="flex min-h-dvh flex-col lg:flex-row">
          <main className="relative flex flex-1 flex-col lg:order-last lg:min-w-0">
            {children}
          </main>
          <Navigation />
        </div>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
