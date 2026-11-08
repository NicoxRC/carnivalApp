"use client";

import maplibregl, { type Map as MapaGL, type Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { estiloMapa, LIMITES_TESELAS, ZOOM_MAX, ZOOM_MIN } from "@/lib/mapa";
import { SENDA } from "@/lib/senda";

interface Props {
  lat: number | null;
  lng: number | null;
  onCambio: (lat: number, lng: number) => void;
}

/**
 * Mapa para ubicar un comercio: se toca donde queda o se arrastra el pin.
 * Lleva la senda dibujada porque lo que importa es dónde queda respecto al
 * recorrido, que es como lo va a buscar la gente.
 */
export default function MapaSelector({ lat, lng, onCambio }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const pin = useRef<Marker | null>(null);
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  useEffect(() => {
    if (!contenedor.current) return;
    const centro: [number, number] =
      lat !== null && lng !== null ? [lng, lat] : (SENDA.geojson.geometry.coordinates[0] as [number, number]);

    const m = new maplibregl.Map({
      container: contenedor.current,
      style: estiloMapa(),
      center: centro,
      zoom: lat !== null ? 16 : 14,
      maxBounds: LIMITES_TESELAS,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      dragRotate: false,
      attributionControl: { compact: true },
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    m.on("load", () => {
      m.addSource("senda", { type: "geojson", data: SENDA.geojson });
      m.addLayer({
        id: "senda",
        type: "line",
        source: "senda",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ff6a1f", "line-width": 5, "line-opacity": 0.8 },
      });
    });

    const marcador = new maplibregl.Marker({ color: "#2fa898", draggable: true });
    if (lat !== null && lng !== null) marcador.setLngLat([lng, lat]).addTo(m);
    marcador.on("dragend", () => {
      const p = marcador.getLngLat();
      onCambioRef.current(p.lat, p.lng);
    });
    m.on("click", (e) => {
      marcador.setLngLat(e.lngLat).addTo(m);
      onCambioRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    mapa.current = m;
    pin.current = marcador;
    return () => {
      m.remove();
      mapa.current = null;
      pin.current = null;
    };
    // Se monta una vez por formulario; los cambios llegan por el pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={contenedor}
      className="h-72 w-full overflow-hidden rounded-2xl border border-borde-2"
      aria-label="Mapa para ubicar el comercio"
    />
  );
}
