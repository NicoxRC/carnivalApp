import type { Feature, LineString } from "geojson";

export const POSTS = ["head", "middle", "tail"] as const;
export type Post = (typeof POSTS)[number];

export interface Course {
  id: string;
  name: string;
  official: boolean;
  warning?: string;
  geojson: Feature<LineString>;
  lengthMetres: number;
  waypoints: Waypoint[];
}

export const WAYPOINT_KINDS = ["church", "mall", "school", "university", "square", "park", "stadium", "hospital"] as const;
export type WaypointKind = (typeof WAYPOINT_KINDS)[number];

export interface Waypoint {
  id: string;
  name: string;
  short: string;
  kind: WaypointKind;
  lat: number;
  lng: number;
  metres: number;
  offsetM: number;
}

export interface PositionInput {
  paradeId: string;
  post: Post;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  ts?: number;
}

export interface Position {
  post: Post;
  lat: number;
  lng: number;
  metres: number;
  accuracyM: number | null;
  ts: number;
}

export interface HistorySample {
  metres: number;
  ts: number;
}

export const PARADE_STATES = ["scheduled", "in_progress", "finished"] as const;
export type ParadeStatus = (typeof PARADE_STATES)[number];

export interface ParadeState {
  paradeId: string;
  name: string;
  state: ParadeStatus;
  date: string;
  startTime: string;
  courseId: string;
  positions: Partial<Record<Post, Position>>;
  headHistory: HistorySample[];
  announcements: Announcement[];
  serverTs: number;
}

export interface Parade {
  id: string;
  name: string;
  date: string;
  startTime: string;
  state: ParadeStatus;
}

export const EVENT_CATEGORY_IDS = ["tasca", "stage", "cultural", "kids"] as const;
export type EventCategory = (typeof EVENT_CATEGORY_IDS)[number];

export interface ScheduleEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  description: string;
  category: EventCategory;
  placeName: string;
  lat: number | null;
  lng: number | null;
  sponsored: boolean;
}

export const ANNOUNCEMENT_LEVELS = ["info", "alert"] as const;
export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number];

export interface Announcement {
  id: string;
  text: string;
  level: AnnouncementLevel;
  createdAt: number;
  expiresAt: number | null;
}

export const MAX_ACCURACY_M = 150;

export const NO_SIGNAL_MS = 5 * 60 * 1000;

export const SPEED_WINDOW_MS = 10 * 60 * 1000;

export const MIN_ADVANCE_M = 25;

export const STOPPED_MS = 10 * 60 * 1000;

export const NOT_MOVING_NOTICE_MS = 3 * 60 * 1000;

export const BUSINESS_CATEGORY_IDS = ["restaurant", "tasca", "cafe", "ice_cream", "bakery", "shop", "bar", "pharmacy"] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORY_IDS)[number];

export const SERVICE_CATEGORY_IDS = ["toilet", "water", "first_aid", "police", "road_closure"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORY_IDS)[number];

export interface MenuItem {
  name: string;
  price: string;
}

export const OFFER_TIMING_IDS = ["always", "before", "after"] as const;
export type OfferTiming = (typeof OFFER_TIMING_IDS)[number];

export const METRIC_TYPES = ["card", "map", "menu", "whatsapp", "link", "offer"] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const BUSINESS_PLAN_IDS = ["basic", "featured"] as const;
export type BusinessPlan = (typeof BUSINESS_PLAN_IDS)[number];

export interface Business {
  id: string;
  name: string;
  category: BusinessCategory | ServiceCategory;
  description: string;
  address: string;
  hours: string;
  lat: number;
  lng: number;
  plan: BusinessPlan | null;
  offer: string | null;
  offerTiming: OfferTiming;
  menu: MenuItem[];
  whatsapp: string | null;
  link: string | null;
  visible: boolean;
}

export const ROLES = ["admin", "coordinator", "editor", "moderator", "reporter", "ingest"] as const;
export type Role = (typeof ROLES)[number];

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  post: Post | null;
  active: boolean;
  lastSignalAt: number | null;
  createdAt: number;
}

export const PHOTO_STATES = ["pending", "approved", "rejected"] as const;
export type PhotoState = (typeof PHOTO_STATES)[number];

export interface Photo {
  id: string;
  paradeId: string | null;
  metres: number | null;
  state: PhotoState;
  createdAt: number;
  url: string;
}
