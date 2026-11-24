/**
 * Genera `src/data/estilo-mapa.json`: las capas del mapa base.
 *
 * Se genera una vez y se versiona, en vez de calcularse en el navegador, por
 * dos razones: el celular no descarga la librería de estilos (solo el JSON
 * resultante), y cualquier cambio de colores queda visible en el diff.
 *
 *   npm run mapa:estilo
 *
 * Cuándo volver a correrlo: si se cambian los colores de abajo o se actualiza
 * `@protomaps/basemaps`. El archivo de teselas (`public/mapa/pasto.pmtiles`) se
 * regenera aparte; ver README, «El mapa base».
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";

/**
 * Parte del sabor «light» de Protomaps y lo lleva al papel de la app.
 * El mapa base es contexto: tiene que dejar que la senda y los marcadores
 * salten a la vista. Por eso tonos cálidos y apagados, y calles blancas que
 * se leen bien a pleno sol.
 */
const base = namedFlavor("light");

const PAPEL: Flavor = {
  ...base,
  background: "#eceae2",
  earth: "#eceae2",
  buildings: "#dedad0",
  water: "#b8d0dc",
  park_a: "#dde2cc",
  park_b: "#dde2cc",
  wood_a: "#d9dfc6",
  wood_b: "#d9dfc6",
  scrub_a: "#e0e3d0",
  scrub_b: "#e0e3d0",
  pedestrian: "#e6e2d8",
  school: "#e6e1d6",
  hospital: "#ebe0dc",
  industrial: "#e3e0d8",
  roads_label_minor: "#6f6f78",
  roads_label_minor_halo: "#f6f4ee",
  roads_label_major: "#5c5c66",
  roads_label_major_halo: "#f6f4ee",
  subplace_label: "#5c5c66",
  subplace_label_halo: "#f6f4ee",
  city_label: "#3f3f47",
  city_label_halo: "#f6f4ee",
  // Sin puntos de interés del mapa base: los PDI de la app (comercios,
  // tarimas, hitos) son los únicos que tienen que verse. Dos capas de iconos
  // compitiendo en la misma cuadra no las lee nadie.
  pois: undefined,
};

/**
 * Capas que piden un sprite de iconos (sentido de vía, escudos de carretera).
 * No se sirve sprite: son ruido para alguien parado en la senda.
 */
const SIN_SPRITE = new Set(["roads_oneway", "roads_shields"]);

const capas = layers("protomaps", PAPEL, { lang: "es" })
  .filter((c) => !SIN_SPRITE.has(c.id))
  .map((c) => {
    // Los nombres de ciudad llevan un puntito de sprite a zoom bajo; sin
    // sprite, MapLibre avisaría en consola por cada uno. Se quita el icono y
    // queda el texto.
    if (c.type !== "symbol" || !c.layout || !("icon-image" in c.layout)) return c;
    const { "icon-image": _icono, "icon-size": _tam, ...layout } = c.layout;
    return { ...c, layout };
  });

const destino = resolve(import.meta.dirname, "../src/data/estilo-mapa.json");
writeFileSync(destino, JSON.stringify(capas) + "\n");
console.log(`✓ ${capas.length} capas → ${destino}`);
