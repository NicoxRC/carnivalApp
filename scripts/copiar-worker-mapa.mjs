/**
 * Copia el worker de MapLibre a `public/mapa/`.
 *
 * Desde la versión 6, MapLibre no trae el worker embebido: hay que servirlo
 * como archivo aparte y decirle dónde está (ver `src/lib/mapa.ts`). Se copia
 * desde `node_modules` antes de cada `dev` y `build` en vez de versionarlo,
 * para que nunca quede un worker de una versión distinta a la de la librería:
 * los dos tienen que ser exactamente de la misma.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destino = resolve(raiz, "public/mapa/maplibre-worker.mjs");
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(resolve(raiz, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"), destino);
