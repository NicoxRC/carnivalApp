import { COURSE } from "@/lib/course";

export const BIN_M = 100;

export const DENSITY_REPORT_INTERVAL_MS = 60_000;

export const MIN_USERS_GLOBAL = 50;

export const CROWD_LEVELS = ["calm", "busy", "full"] as const;
export type CrowdLevel = (typeof CROWD_LEVELS)[number];

export interface DensityBin {
  bin: number;
  fromM: number;
  toM: number;
  count: number;
  level: CrowdLevel;
}

export interface Density {
  bins: DensityBin[];
  total: number;
  enough: boolean;
  windowMin: number;
  serverTs: number;
}

export function binOfMetres(metres: number): number {
  const clamped = Math.min(Math.max(metres, 0), COURSE.lengthMetres - 1);
  return Math.floor(clamped / BIN_M);
}

export const LEVEL_COLOR: Record<CrowdLevel, string> = {
  calm: "#0f8f5f",
  busy: "#ffc61a",
  full: "#c0271b",
};
