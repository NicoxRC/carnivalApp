import {
  MIN_ADVANCE_M,
  STOPPED_MS,
  NO_SIGNAL_MS,
  SPEED_WINDOW_MS,
  NOT_MOVING_NOTICE_MS,
  type ParadeState,
  type HistorySample,
} from "@/lib/types";

export const MIN_SPEED_MS = 0.3 / 3.6;

export const NOMINAL_SPEED_MS = 1.2 / 3.6;

const MIN_RELIABLE_WINDOW_S = 90;

const MAX_SPEED_MS = 6 / 3.6;

const HERE_RADIUS_M = 120;

export interface MinuteRange {
  minMin: number;
  maxMin: number;
}

export type Eta =
  | { kind: "no_data"; reason: "no_report" | "no_location" | "off_course" }
  | { kind: "no_signal"; distanceM: number; agoMin: number }
  | {
      kind: "arriving";
      minMin: number;
      maxMin: number;
      distanceM: number;
      speedKmh: number;
      speedMeasured: boolean;
      notMovingMin: number | null;
      tailIn: MinuteRange | null;
    }
  | { kind: "stopped"; distanceM: number; stoppedForMin: number }
  | {
      kind: "passed";
      headDistanceM: number;
      tailDistanceM: number | null;
      tailPassed: boolean;
      tailIn: MinuteRange | null;
    }
  | { kind: "here"; distanceM: number; tailIn: MinuteRange | null };

export interface SpeedEstimate {
  ms: number;
  kmh: number;
  actualAdvanceM: number;
  windowS: number;
  measured: boolean;
  notMovingMs: number;
  stopped: boolean;
}

export function estimateSpeed(
  history: HistorySample[],
  now: number,
): SpeedEstimate {
  const sorted = [...history].sort((a, b) => a.ts - b.ts);
  const unmeasured: SpeedEstimate = {
    ms: NOMINAL_SPEED_MS,
    kmh: NOMINAL_SPEED_MS * 3.6,
    actualAdvanceM: 0,
    windowS: 0,
    measured: false,
    notMovingMs: 0,
    stopped: false,
  };
  if (sorted.length < 2) return unmeasured;

  const latest = sorted[sorted.length - 1];

  const window = sorted.filter((m) => now - m.ts <= SPEED_WINDOW_MS);
  let ms = NOMINAL_SPEED_MS;
  let measured = false;
  let actualAdvanceM = 0;
  let windowS = 0;
  if (window.length >= 2) {
    const first = window[0];
    windowS = (window[window.length - 1].ts - first.ts) / 1000;
    actualAdvanceM = window[window.length - 1].metres - first.metres;
    if (windowS >= MIN_RELIABLE_WINDOW_S) {
      const raw = actualAdvanceM / windowS;
      if (raw <= MAX_SPEED_MS) {
        ms = Math.max(raw, MIN_SPEED_MS);
        measured = true;
      }
    }
  }

  let notMovingMs = latest.ts - sorted[0].ts;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (latest.metres - sorted[i].metres > MIN_ADVANCE_M) {
      notMovingMs = latest.ts - sorted[i].ts;
      break;
    }
  }

  return {
    ms,
    kmh: ms * 3.6,
    actualAdvanceM,
    windowS,
    measured,
    notMovingMs,
    stopped: notMovingMs >= STOPPED_MS,
  };
}

function toMultipleOf5(n: number, mode: "down" | "up"): number {
  return mode === "down" ? Math.floor(n / 5) * 5 : Math.ceil(n / 5) * 5;
}

export function toRange(minutes: number): MinuteRange {
  const low = Math.max(0, toMultipleOf5(minutes * 0.75, "down"));
  let high = toMultipleOf5(minutes * 1.4, "up");
  if (high - low < 5) high = low + 5;
  return { minMin: low, maxMin: high };
}

export interface EtaArgs {
  state: ParadeState;
  userMetres: number | null;
  userOffsetM: number | null;
  maxOffsetM: number;
  now: number;
}

export function computeEta({
  state,
  userMetres,
  userOffsetM,
  maxOffsetM,
  now,
}: EtaArgs): Eta {
  const head = state.positions.head;
  if (!head) return { kind: "no_data", reason: "no_report" };
  if (userMetres === null) return { kind: "no_data", reason: "no_location" };
  if (userOffsetM !== null && userOffsetM > maxOffsetM) {
    return { kind: "no_data", reason: "off_course" };
  }

  const distance = userMetres - head.metres;

  if (noSignal(head.ts, now) && distance > HERE_RADIUS_M) {
    return {
      kind: "no_signal",
      distanceM: distance,
      agoMin: Math.round((now - head.ts) / 60000),
    };
  }

  const speed = estimateSpeed(state.headHistory, now);

  const tail = state.positions.tail;
  const tailRemaining = tail ? userMetres - tail.metres : null;
  const tailIn =
    tail && tailRemaining !== null && tailRemaining > HERE_RADIUS_M && !speed.stopped && !noSignal(tail.ts, now)
      ? toRange(tailRemaining / speed.ms / 60)
      : null;

  if (Math.abs(distance) <= HERE_RADIUS_M) {
    return { kind: "here", distanceM: Math.abs(distance), tailIn };
  }

  if (distance < 0) {
    const tailGap = tailRemaining;
    return {
      kind: "passed",
      headDistanceM: Math.abs(distance),
      tailDistanceM: tailGap === null ? null : Math.abs(tailGap),
      tailPassed: tailGap !== null && tailGap < 0,
      tailIn,
    };
  }

  if (speed.stopped) {
    return {
      kind: "stopped",
      distanceM: distance,
      stoppedForMin: Math.round(speed.notMovingMs / 60000),
    };
  }

  const minutes = distance / speed.ms / 60;
  const { minMin, maxMin } = toRange(minutes);

  return {
    kind: "arriving",
    minMin,
    maxMin,
    distanceM: distance,
    speedKmh: speed.kmh,
    speedMeasured: speed.measured,
    notMovingMin:
      speed.notMovingMs >= NOT_MOVING_NOTICE_MS ? Math.round(speed.notMovingMs / 60000) : null,
    tailIn,
  };
}

export function noSignal(ts: number, now: number): boolean {
  return now - ts > NO_SIGNAL_MS;
}
