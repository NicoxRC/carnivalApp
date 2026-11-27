import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";

const base = namedFlavor("light");

const PAPER: Flavor = {
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
  pois: undefined,
};

const NO_SPRITE = new Set(["roads_oneway", "roads_shields"]);

const styleLayers = layers("protomaps", PAPER, { lang: "es" })
  .filter((c) => !NO_SPRITE.has(c.id))
  .map((c) => {
    if (c.type !== "symbol" || !c.layout || !("icon-image" in c.layout)) return c;
    const { "icon-image": _icon, "icon-size": _size, ...layout } = c.layout;
    return { ...c, layout };
  });

const target = resolve(import.meta.dirname, "../src/data/map-style.json");
writeFileSync(target, JSON.stringify(styleLayers) + "\n");
console.log(`✓ ${styleLayers.length} layers → ${target}`);
