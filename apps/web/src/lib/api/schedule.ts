import { bool, list, num, numOrNull, obj, oneOf, str, strOrNull, withoutInvalid } from "@/lib/api/parse";
import type { WaypointPass } from "@/lib/progress";
import { EVENT_CATEGORY_IDS, PARADE_STATES, type Parade, type ScheduleEvent } from "@/lib/types";

export interface Schedule {
  parades: Parade[];
  events: ScheduleEvent[];
  today: string;
  currentId: string | null;
}

function parade(v: unknown): Parade {
  const o = obj(v, "parades[]");
  return {
    id: str(o, "id"),
    name: str(o, "name"),
    date: str(o, "date"),
    startTime: str(o, "startTime"),
    state: oneOf(PARADE_STATES, o, "state"),
  };
}

function event(v: unknown): ScheduleEvent {
  const o = obj(v, "events[]");
  return {
    id: str(o, "id"),
    date: str(o, "date"),
    startTime: str(o, "startTime"),
    endTime: strOrNull(o, "endTime"),
    title: str(o, "title"),
    description: str(o, "description"),
    category: oneOf(EVENT_CATEGORY_IDS, o, "category"),
    placeName: str(o, "placeName"),
    lat: numOrNull(o, "lat"),
    lng: numOrNull(o, "lng"),
    sponsored: bool(o, "sponsored"),
  };
}

export function parseSchedule(json: unknown): Schedule {
  const o = obj(json, "the schedule");
  return {
    parades: withoutInvalid(list(o.parades, "parades"), parade, "a parade"),
    events: withoutInvalid(list(o.events, "events"), event, "an event"),
    today: str(o, "today"),
    currentId: strOrNull(o, "currentId"),
  };
}

function pass(v: unknown): WaypointPass {
  const o = obj(v, "passes[]");
  return {
    waypointId: str(o, "waypointId"),
    name: str(o, "name"),
    metres: num(o, "metres"),
    ts: numOrNull(o, "ts"),
  };
}

export function parseProgress(json: unknown): WaypointPass[] {
  return list(obj(json, "the progress").passes, "passes").map(pass);
}
