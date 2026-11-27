import { pointAtMetre, COURSE } from "@/lib/course";
import type { PositionInput, Post } from "@/lib/types";

export interface SimulationOptions {
  speedKmh: number;
  gapM: number;
  stops: boolean;
  startM: number;
  accuracyM: number;
}

export const DEFAULT_OPTIONS: SimulationOptions = {
  speedKmh: 1.5,
  gapM: 550,
  stops: true,
  startM: 0,
  accuracyM: 12,
};

export class ParadeSimulator {
  private headMetres: number;
  private stoppedUntilMs = 0;
  private nextStopMs: number;
  private readonly options: SimulationOptions;

  constructor(options: Partial<SimulationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.headMetres = this.options.startM;
    this.nextStopMs = Date.now() + this.randomInterval(60_000, 150_000);
  }

  private randomInterval(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  get isStopped(): boolean {
    return Date.now() < this.stoppedUntilMs;
  }

  get advanceM(): number {
    return this.headMetres;
  }

  get finished(): boolean {
    return this.headMetres >= COURSE.lengthMetres;
  }

  advance(dtSeconds: number, paradeId: string): PositionInput[] {
    const now = Date.now();

    if (this.options.stops && !this.isStopped && now >= this.nextStopMs) {
      this.stoppedUntilMs = now + this.randomInterval(40_000, 120_000);
      this.nextStopMs = this.stoppedUntilMs + this.randomInterval(90_000, 200_000);
    }

    if (!this.isStopped) {
      const factor = 0.8 + Math.random() * 0.4;
      const ms = (this.options.speedKmh / 3.6) * factor;
      this.headMetres = Math.min(this.headMetres + ms * dtSeconds, COURSE.lengthMetres);
    }

    return this.positions(paradeId);
  }

  positions(paradeId: string): PositionInput[] {
    const metresByPost: Record<Post, number> = {
      head: this.headMetres,
      middle: Math.max(0, this.headMetres - this.options.gapM),
      tail: Math.max(0, this.headMetres - this.options.gapM * 2),
    };

    return (Object.keys(metresByPost) as Post[]).map((post) => {
      const { lat, lng } = pointAtMetre(metresByPost[post]);
      const jitter = () => (Math.random() - 0.5) * 0.00008;
      return {
        paradeId,
        post,
        lat: lat + jitter(),
        lng: lng + jitter(),
        accuracyM: this.options.accuracyM,
        ts: Date.now(),
      };
    });
  }

  reset(startM = 0) {
    this.headMetres = startM;
    this.stoppedUntilMs = 0;
    this.nextStopMs = Date.now() + this.randomInterval(60_000, 150_000);
  }
}

export const REPORT_INTERVAL_MS = 12_000;
