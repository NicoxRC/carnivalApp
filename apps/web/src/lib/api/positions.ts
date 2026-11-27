import type { Post, PositionInput } from "@/lib/types";

export interface ApiPosition {
  post: Post;
  lat: number;
  lng: number;
  accuracyM: number | null;
  ts?: number;
}

export function positionForApi(input: PositionInput): ApiPosition {
  return {
    post: input.post,
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM ?? null,
    ...(input.ts !== undefined ? { ts: input.ts } : {}),
  };
}
