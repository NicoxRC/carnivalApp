import { list, num, numOrNull, obj, oneOf, str } from "@/lib/api/parse";
import {
  ANNOUNCEMENT_LEVELS,
  PARADE_STATES,
  POSTS,
  type Announcement,
  type HistorySample,
  type ParadeState,
  type Position,
} from "@/lib/types";

function position(v: unknown, field: string): Position {
  const o = obj(v, field);
  return {
    post: oneOf(POSTS, o, "post"),
    lat: num(o, "lat"),
    lng: num(o, "lng"),
    metres: num(o, "metres"),
    accuracyM: numOrNull(o, "accuracyM"),
    ts: num(o, "ts"),
  };
}

function sample(v: unknown): HistorySample {
  const o = obj(v, "headHistory[]");
  return { metres: num(o, "metres"), ts: num(o, "ts") };
}

function announcement(v: unknown): Announcement {
  const o = obj(v, "announcements[]");
  return {
    id: str(o, "id"),
    text: str(o, "text"),
    level: oneOf(ANNOUNCEMENT_LEVELS, o, "level"),
    createdAt: num(o, "createdAt"),
    expiresAt: numOrNull(o, "expiresAt"),
  };
}

export function parseParadeState(json: unknown): ParadeState {
  const o = obj(json, "the state");
  const positions: ParadeState["positions"] = {};
  for (const [post, value] of Object.entries(obj(o.positions, "positions"))) {
    const p = position(value, `positions.${post}`);
    if (p.post !== post) throw new Error(`Invalid API response: positions.${post} carries post «${p.post}».`);
    positions[p.post] = p;
  }
  return {
    paradeId: str(o, "paradeId"),
    name: str(o, "name"),
    state: oneOf(PARADE_STATES, o, "state"),
    date: str(o, "date"),
    startTime: str(o, "startTime"),
    courseId: str(o, "courseId"),
    positions,
    headHistory: list(o.headHistory, "headHistory").map(sample),
    announcements: list(o.announcements, "announcements").map(announcement),
    serverTs: num(o, "serverTs"),
  };
}
