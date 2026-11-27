"use client";

import * as maplibregl from "maplibre-gl";
import { type Map as MapGL, type Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { mapStyle, TILES_BOUNDS, ZOOM_MAX, ZOOM_MIN } from "@/lib/map";
import { COURSE } from "@/lib/course";

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export default function MapPicker({ lat, lng, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapGL | null>(null);
  const pin = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!container.current) return;
    const centre: [number, number] =
      lat !== null && lng !== null ? [lng, lat] : (COURSE.geojson.geometry.coordinates[0] as [number, number]);

    const m = new maplibregl.Map({
      container: container.current,
      style: mapStyle(),
      center: centre,
      zoom: lat !== null ? 16 : 14,
      maxBounds: TILES_BOUNDS,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      dragRotate: false,
      attributionControl: { compact: true },
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    m.on("load", () => {
      m.addSource("course", { type: "geojson", data: COURSE.geojson });
      m.addLayer({
        id: "course",
        type: "line",
        source: "course",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ff6a1f", "line-width": 5, "line-opacity": 0.8 },
      });
    });

    const marker = new maplibregl.Marker({ color: "#2fa898", draggable: true });
    if (lat !== null && lng !== null) marker.setLngLat([lng, lat]).addTo(m);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      onChangeRef.current(p.lat, p.lng);
    });
    m.on("click", (e) => {
      marker.setLngLat(e.lngLat).addTo(m);
      onChangeRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    map.current = m;
    pin.current = marker;
    return () => {
      m.remove();
      map.current = null;
      pin.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={container}
      className="h-72 w-full overflow-hidden rounded-2xl border border-line-2"
      aria-label="Mapa para ubicar el comercio"
    />
  );
}
