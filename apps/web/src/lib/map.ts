import * as maplibregl from "maplibre-gl";
import { type LngLatBoundsLike } from "maplibre-gl";
import { Protocol } from "pmtiles";

import baseLayers from "@/data/map-style.json";

export const TILES_URL = process.env.NEXT_PUBLIC_MAP_PMTILES || "/map/pasto.pmtiles";

export const TILES_BOUNDS: LngLatBoundsLike = [
  [-77.33, 1.16],
  [-77.23, 1.26],
];

export const ZOOM_MIN = 12;
export const ZOOM_MAX = 19;

let protocolRegistered = false;

export function mapStyle(): maplibregl.StyleSpecification {
  if (!protocolRegistered) {
    maplibregl.addProtocol("pmtiles", new Protocol().tile);
    maplibregl.setWorkerUrl(`${window.location.origin}/map/maplibre-worker.mjs`);
    protocolRegistered = true;
  }
  const origin = window.location.origin;
  const tiles = new URL(TILES_URL, origin).href;
  return {
    version: 8,
    glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${tiles}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: baseLayers as maplibregl.LayerSpecification[],
  };
}
