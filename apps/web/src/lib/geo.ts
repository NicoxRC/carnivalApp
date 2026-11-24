const RADIO_TIERRA_M = 6_371_000;

/** Distancia en línea recta entre dos puntos, en metros. */
export function distanciaHaversine(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
