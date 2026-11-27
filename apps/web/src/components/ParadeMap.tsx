"use client";

import lineSliceAlong from "@turf/line-slice-along";
import * as maplibregl from "maplibre-gl";
import { type LngLatBoundsLike, type Map as MapGL, type Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, LineString } from "geojson";

import { LEVEL_COLOR, type Density } from "@/lib/density";
import { noSignal } from "@/lib/eta";
import { timeAgo } from "@/lib/format";
import { mapStyle, TILES_BOUNDS, ZOOM_MAX, ZOOM_MIN } from "@/lib/map";
import { pointAtMetre, COURSE } from "@/lib/course";
import { POSTS, type ParadeState, type Post, type WaypointKind } from "@/lib/types";
import type { UserLocation } from "@/lib/hooks/useUserLocation";

const NAME_LABEL: Record<Post, string> = { head: "Cabeza", middle: "Mitad", tail: "Cola" };

const WAYPOINT_ICON: Record<WaypointKind, string> = {
  church: '<path d="M12 2v3M10.5 3.5h3M12 5 7 9v12h10V9z"/>',
  mall: '<path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2"/>',
  school: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5"/>',
  university: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v5c0 1 2 2 5 2s5-1 5-2v-5"/>',
  square: '<path d="M4 20h16M7 20V9l5-4 5 4v11"/><path d="M10 20v-5h4v5"/>',
  park: '<path d="M12 3 7 12h10zM12 8l-4 7h8z"/><path d="M12 15v6"/>',
  stadium: '<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="4" ry="2.6"/>',
  hospital: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
};

const LABELS_ZOOM = 13.6;

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  group: "stage" | "business" | "servicio";
  description?: string;
  address?: string;
  hours?: string;
  offer?: string | null;
  plan?: "basic" | "featured" | null;
  menu?: { name: string; price: string }[];
  whatsapp?: string | null;
  link?: string | null;
}

const BUSINESS_COLOR = "#2fa898";

const SERVICE_COLOR = "#1487cc";

const POINT_COLOR: Record<string, string> = {
  stage: "#a06bff",
  toilet: SERVICE_COLOR,
  water: SERVICE_COLOR,
  first_aid: "#c0271b",
  police: SERVICE_COLOR,
  road_closure: "#8a5a00",
};

const POINT_ICON: Record<string, string> = {
  stage: '<path d="M4 18V9l8-5 8 5v9z"/>',
  restaurant: '<path d="M7 2v9M5 2v5a2 2 0 0 0 4 0V2M7 11v11M17 2c-1.5 1-2 3-2 5s.5 3 2 3v12"/>',
  tasca: '<path d="M5 3h14l-6 8v7h3v3H8v-3h3v-7z"/>',
  cafe: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h2a2.5 2.5 0 0 1 0 5h-2M6 2v3M10 2v3M14 2v3"/>',
  ice_cream: '<path d="M8 9a4 4 0 1 1 8 0zM7.5 10h9L12 22z"/>',
  bakery: '<path d="M4 12c0-3 2-5 4-5h8c2 0 4 2 4 5v2a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM9 8v9M15 8v9"/>',
  shop: '<path d="M4 9h16v10H4zM4 9l1.5-5h13L20 9M9 19v-5h6v5"/>',
  bar: '<path d="M9 3h6v4c0 1-1 2-1 3v10h-4V10c0-1-1-2-1-3zM9 7h6"/>',
  pharmacy: '<path d="M5 5h14v14H5zM12 8v8M8 12h8"/>',
  toilet: '<circle cx="8" cy="5" r="2"/><circle cx="16" cy="5" r="2"/><path d="M8 9v11M5.5 13h5M16 9l-2.5 6h5zM16 15v5"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  first_aid: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
  police: '<path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z"/>',
  road_closure: '<circle cx="12" cy="12" r="9"/><path d="M7 12h10"/>',
};

const DEFAULT_ICON = '<circle cx="12" cy="12" r="7"/>';

export type Framing =
  | { mode: "all" | "me" | "head"; nonce: number }
  | { mode: "point"; lat: number; lng: number; nonce: number };

interface Props {
  state: ParadeState | null;
  points: MapPoint[];
  density: Density | null;
  pickedPoint: string | null;
  onPointClick: (point: MapPoint) => void;
  location: UserLocation | null;
  now: number;
  pickingPoint: boolean;
  onPointPicked: (lat: number, lng: number) => void;
  framing: Framing | null;
  meetingM?: number | null;
}

function courseBounds(): LngLatBoundsLike {
  const b = new maplibregl.LngLatBounds();
  for (const c of COURSE.geojson.geometry.coordinates) b.extend([c[0], c[1]]);
  return b;
}

const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

const EMPTY_LINE: Feature<LineString> = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
};

function stretch(fromM: number, toM: number): Feature<LineString> {
  const a = Math.max(0, Math.min(fromM, COURSE.lengthMetres));
  const b = Math.max(0, Math.min(toM, COURSE.lengthMetres));
  if (b - a < 1) return EMPTY_LINE;
  try {
    return lineSliceAlong(COURSE.geojson, a / 1000, b / 1000, { units: "kilometers" });
  } catch {
    return EMPTY_LINE;
  }
}

function headLabel(ts: number, now: number, off: boolean): string {
  if (off) return "sin señal";
  return `Va por acá · ${timeAgo(ts, now).replace("hace ", "")}`;
}

export default function ParadeMap({
  state,
  points,
  density,
  pickedPoint,
  onPointClick,
  location,
  now,
  pickingPoint,
  onPointPicked,
  framing,
  meetingM = null,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapGL | null>(null);
  const ready = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const markers = useRef(new Map<Post, Marker>());
  const pointMarkers = useRef(new Map<string, Marker>());
  const waypointMarkers = useRef(new Map<string, Marker>());
  const [zoom, setZoom] = useState(13);
  const userMarker = useRef<Marker | null>(null);
  const meetingMarker = useRef<Marker | null>(null);
  const onPoint = useRef(onPointPicked);
  const onPointClickRef = useRef(onPointClick);
  const marking = useRef(pickingPoint);

  onPoint.current = onPointPicked;
  onPointClickRef.current = onPointClick;
  marking.current = pickingPoint;

  useEffect(() => {
    if (!container.current || map.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      style: mapStyle(),
      bounds: courseBounds(),
      fitBoundsOptions: { padding: 56 },
      maxBounds: TILES_BOUNDS,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
    });
    m.touchZoomRotate.disableRotation();

    m.on("error", (e) => console.error("[map]", e.error?.message ?? e));

    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __map?: MapGL }).__map = m;
    }

    m.on("load", () => {
      m.addSource("crowd", { type: "geojson", data: EMPTY_COLLECTION });
      m.addSource("course", { type: "geojson", data: COURSE.geojson });

      m.addLayer({
        id: "crowd",
        type: "line",
        source: "crowd",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 38,
          "line-blur": 16,
          "line-opacity": 0.62,
          "line-color": [
            "match",
            ["get", "level"],
            "full",
            LEVEL_COLOR.full,
            "busy",
            LEVEL_COLOR.busy,
            LEVEL_COLOR.calm,
          ],
        },
      });
      m.addSource("stretch-ahead", { type: "geojson", data: EMPTY_LINE });
      m.addSource("stretch-parade", { type: "geojson", data: EMPTY_LINE });

      m.addLayer({
        id: "course-done",
        type: "line",
        source: "course",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#bdbbb2", "line-width": 9 },
      });

      m.addLayer({
        id: "course-ahead",
        type: "line",
        source: "stretch-ahead",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#141414", "line-width": 6, "line-dasharray": [0.5, 2] },
      });

      m.addLayer({
        id: "course-parade",
        type: "line",
        source: "stretch-parade",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ff6a1f", "line-width": 11 },
      });

      ready.current = true;
      setMapReady(true);
      m.resize();
    });

    m.on("zoom", () => setZoom(m.getZoom()));

    m.on("click", (e) => {
      if (!marking.current) return;
      onPoint.current(e.lngLat.lat, e.lngLat.lng);
    });

    map.current = m;
    const markerMaps = [markers.current, pointMarkers.current, waypointMarkers.current];

    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
      setMapReady(false);
      for (const markerMap of markerMaps) markerMap.clear();
      userMarker.current = null;
      meetingMarker.current = null;
    };
  }, []);

  useEffect(() => {
    const c = container.current;
    if (c) c.style.cursor = pickingPoint ? "crosshair" : "";
  }, [pickingPoint]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !state) return;

    for (const post of POSTS) {
      const pos = state.positions[post];
      const existing = markers.current.get(post);

      if (!pos) {
        existing?.remove();
        markers.current.delete(post);
        continue;
      }

      const off = noSignal(pos.ts, now);

      if (existing) {
        existing.setLngLat([pos.lng, pos.lat]);
        const el = existing.getElement();
        el.querySelector(".marker")?.classList.toggle("marker--off", off);
        const bubble = el.querySelector(".head-bubble");
        if (bubble) bubble.textContent = headLabel(pos.ts, now, off);
        continue;
      }

      const root = document.createElement("div");
      root.className = "parade-marker";

      const point = document.createElement("div");
      point.className = `marker marker--${post}${off ? " marker--off" : ""}`;
      point.setAttribute("role", "img");
      point.setAttribute("aria-label", NAME_LABEL[post]);
      point.title = NAME_LABEL[post];
      if (post === "head") {
        point.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M6 3l12 9-12 9z"/></svg>';
      }
      root.appendChild(point);

      if (post === "head") {
        const bubble = document.createElement("div");
        bubble.className = "head-bubble";
        bubble.textContent = headLabel(pos.ts, now, off);
        root.appendChild(bubble);
      }

      markers.current.set(
        post,
        new maplibregl.Marker({ element: root }).setLngLat([pos.lng, pos.lat]).addTo(m),
      );
    }
  }, [state, now, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !state) return;

    const missingSource = m.getSource("stretch-ahead") as maplibregl.GeoJSONSource | undefined;
    const paradeSource = m.getSource("stretch-parade") as maplibregl.GeoJSONSource | undefined;
    if (!missingSource || !paradeSource) return;

    const head = state.positions.head;
    if (!head) {
      missingSource.setData(stretch(0, COURSE.lengthMetres));
      paradeSource.setData(EMPTY_LINE);
      return;
    }

    missingSource.setData(stretch(head.metres, COURSE.lengthMetres));
    paradeSource.setData(stretch(state.positions.tail?.metres ?? 0, head.metres));
  }, [state, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;

    for (const h of COURSE.waypoints) {
      if (waypointMarkers.current.has(h.id)) continue;

      const el = document.createElement("div");
      el.className = "waypoint";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", h.name);
      el.title = h.name;
      el.innerHTML =
        `<span class="waypoint__icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" ` +
        `stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ` +
        `aria-hidden="true">${WAYPOINT_ICON[h.kind]}</svg></span>` +
        `<span class="waypoint__name">${h.short}</span>`;

      waypointMarkers.current.set(
        h.id,
        new maplibregl.Marker({ element: el }).setLngLat([h.lng, h.lat]).addTo(m),
      );
    }
  }, [mapReady]);

  useEffect(() => {
    const show = zoom >= LABELS_ZOOM;
    for (const marker of waypointMarkers.current.values()) {
      marker.getElement().classList.toggle("waypoint--unnamed", !show);
    }
  }, [zoom, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;

    const current = new Set(points.map((p) => p.id));
    for (const [id, marker] of pointMarkers.current) {
      if (!current.has(id)) {
        marker.remove();
        pointMarkers.current.delete(id);
      }
    }

    for (const p of points) {
      if (pointMarkers.current.has(p.id)) continue;
      const color = POINT_COLOR[p.category] ?? BUSINESS_COLOR;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "map-point";
      el.style.setProperty("--color-punto", color);
      el.setAttribute("aria-label", `${p.name}. Ver información.`);
      el.title = p.name;
      el.innerHTML =
        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
        `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
        `${POINT_ICON[p.category] ?? DEFAULT_ICON}</svg>`;

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onPointClickRef.current(p);
      });

      pointMarkers.current.set(
        p.id,
        new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m),
      );
    }
  }, [points, mapReady]);

  useEffect(() => {
    for (const [id, marker] of pointMarkers.current) {
      marker.getElement().classList.toggle("map-point--active", id === pickedPoint);
    }
  }, [pickedPoint, points]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    const source = m.getSource("crowd") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    if (!density || !density.enough) {
      source.setData(EMPTY_COLLECTION);
      return;
    }

    source.setData({
      type: "FeatureCollection",
      features: density.bins.map((b) => ({
        ...stretch(b.fromM, b.toM),
        properties: { level: b.level, count: b.count },
      })),
    } as FeatureCollection);
  }, [density, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;

    if (!location) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }

    if (userMarker.current) {
      userMarker.current.setLngLat([location.lng, location.lat]);
      return;
    }

    const el = document.createElement("div");
    el.className = "user-marker";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Tu ubicación");
    el.innerHTML = '<span></span><span class="halo"></span><span></span>';
    userMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat([location.lng, location.lat])
      .addTo(m);
  }, [location, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    meetingMarker.current?.remove();
    meetingMarker.current = null;
    if (meetingM === null) return;
    const { lat, lng } = pointAtMetre(meetingM);
    const el = document.createElement("div");
    el.className = "meeting-marker";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "Punto de encuentro");
    el.innerHTML =
      '<svg width="34" height="34" viewBox="0 0 24 24" fill="#141414" stroke="#fff" stroke-width="1.4" aria-hidden="true"><path d="M12 22s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12z"/><circle cx="12" cy="10" r="2.6" fill="#ffc61a" stroke="none"/></svg>';
    meetingMarker.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .addTo(m);
    m.easeTo({ center: [lng, lat], zoom: 15.5, duration: 600 });
  }, [meetingM, mapReady]);

  useEffect(() => {
    const m = map.current;
    if (!m || !framing) return;

    if (framing.mode === "all") {
      m.fitBounds(courseBounds(), { padding: 56, duration: 600 });
      return;
    }
    if (framing.mode === "me" && location) {
      m.easeTo({ center: [location.lng, location.lat], zoom: 15.5, duration: 600 });
      return;
    }
    if (framing.mode === "head" && state?.positions.head) {
      const c = state.positions.head;
      m.easeTo({ center: [c.lng, c.lat], zoom: 15.5, duration: 600 });
      return;
    }
    if (framing.mode === "point") {
      m.easeTo({
        center: [framing.lng, framing.lat],
        zoom: 16,
        offset: [0, -120],
        duration: 600,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framing?.nonce]);

  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" aria-label="Mapa del desfile" />
    </div>
  );
}
