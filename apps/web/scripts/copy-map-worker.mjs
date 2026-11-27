import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "public/mapa/maplibre-worker.mjs");
mkdirSync(dirname(target), { recursive: true });
copyFileSync(resolve(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"), target);
