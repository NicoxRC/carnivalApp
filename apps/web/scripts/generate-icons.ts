import { resolve } from "node:path";

import sharp from "sharp";

const pub = (f: string) => resolve(import.meta.dirname, "../public", f);

const OUTPUTS: [origin: string, target: string, side: number][] = [
  ["icono.svg", "icono-192.png", 192],
  ["icono.svg", "icono-512.png", 512],
  ["icono.svg", "icono-180.png", 180],
  ["icono-maskable.svg", "icono-maskable-512.png", 512],
];

for (const [origin, target, side] of OUTPUTS) {
  await sharp(pub(origin), { density: 400 }).resize(side, side).png().toFile(pub(target));
  console.log(`✓ ${target}`);
}
