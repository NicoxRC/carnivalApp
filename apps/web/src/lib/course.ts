import along from "@turf/along";
import turfLength from "@turf/length";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { point } from "@turf/helpers";
import type { Feature, LineString } from "geojson";

import { COURSE_DEFINITION } from "@/data/carnival-course";
import { translate, type Translator } from "@/lib/i18n-texts";
import type { Waypoint, Course } from "@/lib/types";

const inSpanish: Translator = (key, vars) => translate("es", key, vars);

const geojson = COURSE_DEFINITION.geojson;

function lineLengthMetres(line: Feature<LineString>): number {
  return turfLength(line, { units: "kilometers" }) * 1000;
}

const lengthMetres = lineLengthMetres(geojson);

const waypoints: Waypoint[] = COURSE_DEFINITION.waypoints
  .map((h) => {
    const projection = projectOnCourse(h.lat, h.lng);
    return { ...h, metres: projection.metres, offsetM: projection.offsetM };
  })
  .sort((a, b) => a.metres - b.metres);

export const COURSE: Course = {
  id: COURSE_DEFINITION.id,
  name: COURSE_DEFINITION.name,
  official: COURSE_DEFINITION.official,
  warning: COURSE_DEFINITION.warning,
  geojson,
  lengthMetres,
  waypoints,
};

export interface Projection {
  metres: number;
  offsetM: number;
  lat: number;
  lng: number;
}

export function projectOnCourse(lat: number, lng: number): Projection {
  const snap = nearestPointOnLine(geojson, point([lng, lat]), { units: "kilometers" });
  const [snapLng, snapLat] = snap.geometry.coordinates;
  return {
    metres: (snap.properties.location ?? 0) * 1000,
    offsetM: (snap.properties.dist ?? 0) * 1000,
    lat: snapLat,
    lng: snapLng,
  };
}

export function pointAtMetre(metres: number): { lat: number; lng: number } {
  const clamped = Math.min(Math.max(metres, 0), lengthMetres);
  const p = along(geojson, clamped / 1000, { units: "kilometers" });
  const [lng, lat] = p.geometry.coordinates;
  return { lat, lng };
}

export function nearestWaypoint(metres: number): Waypoint | null {
  let best: Waypoint | null = null;
  let bestDistance = Infinity;
  for (const h of COURSE.waypoints) {
    const d = Math.abs(h.metres - metres);
    if (d < bestDistance) {
      bestDistance = d;
      best = h;
    }
  }
  return best;
}

const WAYPOINT_RADIUS_M = 180;

export interface CourseReference {
  phrase: string;
  waypoint: Waypoint | null;
}

export function describePosition(
  metres: number,
  subject: "it" | "you" = "it",
  t: Translator = inSpanish,
): CourseReference {
  if (COURSE.waypoints.length === 0) return { phrase: "", waypoint: null };

  const near = nearestWaypoint(metres);
  if (near && Math.abs(near.metres - metres) <= WAYPOINT_RADIUS_M) {
    return { phrase: t(`ref.${subject}.at`, { a: near.name }), waypoint: near };
  }

  const previous = [...COURSE.waypoints].reverse().find((h) => h.metres <= metres) ?? null;
  const next = COURSE.waypoints.find((h) => h.metres > metres) ?? null;

  if (previous && next) {
    return { phrase: t(`ref.${subject}.between`, { a: previous.short, b: next.short }), waypoint: next };
  }
  if (next) return { phrase: t(`ref.${subject}.before`, { a: next.name }), waypoint: next };
  if (previous) return { phrase: t(`ref.${subject}.past`, { a: previous.name }), waypoint: previous };
  return { phrase: "", waypoint: null };
}

export const MAX_USER_OFFSET_M = 600;
