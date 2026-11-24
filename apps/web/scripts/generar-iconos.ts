/**
 * Exporta los íconos PNG desde los SVG de `public/`.
 *
 *   npm run iconos
 *
 * iOS no acepta SVG para el ícono de la pantalla de inicio, y las
 * notificaciones tampoco. Volver a correr si cambia `public/icono.svg`.
 */
import { resolve } from "node:path";

import sharp from "sharp";

const pub = (f: string) => resolve(import.meta.dirname, "../public", f);

const SALIDAS: [origen: string, destino: string, lado: number][] = [
  ["icono.svg", "icono-192.png", 192],
  ["icono.svg", "icono-512.png", 512],
  ["icono.svg", "icono-180.png", 180],
  ["icono-maskable.svg", "icono-maskable-512.png", 512],
];

for (const [origen, destino, lado] of SALIDAS) {
  await sharp(pub(origen), { density: 400 }).resize(lado, lado).png().toFile(pub(destino));
  console.log(`✓ ${destino}`);
}
