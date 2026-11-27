import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toRange, computeEta, estimateSpeed } from "@/lib/eta";
import type { ParadeState, HistorySample, Position, Post } from "@/lib/types";

const NOW = 1_800_000_000_000;
const MIN = 60_000;

function history(kmh: number, minutes: number, toM: number): HistorySample[] {
  const ms = kmh / 3.6;
  const points: HistorySample[] = [];
  for (let t = minutes * 60; t >= 0; t -= 20) {
    points.push({ metres: toM - ms * t, ts: NOW - t * 1000 });
  }
  return points;
}

const pos = (post: Post, metres: number, ts = NOW): Position => ({ post, lat: 0, lng: 0, metres, accuracyM: 10, ts });

function state(partial: Partial<ParadeState>): ParadeState {
  return {
    paradeId: "d",
    name: "Desfile",
    state: "in_progress",
    date: "2027-01-06",
    startTime: "09:00",
    courseId: "s",
    positions: {},
    headHistory: [],
    announcements: [],
    serverTs: NOW,
    ...partial,
  };
}

const eta = (e: ParadeState, userMetres: number | null, offset = 0) =>
  computeEta({ state: e, userMetres, userOffsetM: offset, maxOffsetM: 600, now: NOW });

describe("toRange", () => {
  it("always gives a range in multiples of 5, never an exact minute", () => {
    for (const m of [1, 4, 12, 27, 63, 140]) {
      const r = toRange(m);
      assert.equal(r.minMin % 5, 0);
      assert.equal(r.maxMin % 5, 0);
      assert.ok(r.maxMin - r.minMin >= 5, `rango de ${m} min demasiado estrecho`);
      assert.ok(r.minMin <= m && m <= r.maxMin, `${m} min queda fuera de su propio rango`);
    }
  });

  it("is asymmetric: a parade runs late more easily than early", () => {
    const r = toRange(40);
    assert.ok(r.maxMin - 40 > 40 - r.minMin);
  });
});

describe("estimateSpeed", () => {
  it("uses the nominal speed until there are 90 s of history", () => {
    const v = estimateSpeed(history(3, 1, 1000), NOW);
    assert.equal(v.measured, false);
    assert.ok(Math.abs(v.kmh - 1.2) < 0.01);
  });

  it("measures the real speed with enough history", () => {
    const v = estimateSpeed(history(1.8, 8, 1000), NOW);
    assert.equal(v.measured, true);
    assert.ok(Math.abs(v.kmh - 1.8) < 0.05, `measured ${v.kmh}`);
  });

  it("drops a GPS jump instead of believing the parade moves at 40 km/h", () => {
    const v = estimateSpeed(
      [
        { metres: 100, ts: NOW - 4 * MIN },
        { metres: 2800, ts: NOW },
      ],
      NOW,
    );
    assert.equal(v.measured, false);
  });

  it("declares it stopped only after 10 minutes without moving", () => {
    const idle = (min: number) =>
      estimateSpeed(
        Array.from({ length: min * 3 + 1 }, (_, i) => ({ metres: 500 + (i % 2), ts: NOW - (min * 60 - i * 20) * 1000 })),
        NOW,
      );
    assert.equal(idle(6).stopped, false);
    assert.equal(idle(11).stopped, true);
  });
});

describe("computeEta", () => {
  it("makes nothing up without reports from the head", () => {
    assert.deepEqual(eta(state({}), 2000), { kind: "no_data", reason: "no_report" });
  });

  it("says so without a location or far from the course", () => {
    const e = state({ positions: { head: pos("head", 500) } });
    assert.deepEqual(eta(e, null), { kind: "no_data", reason: "no_location" });
    assert.deepEqual(eta(e, 2000, 900), { kind: "no_data", reason: "off_course" });
  });

  it("computes the arrival with the measured speed", () => {
    const e = state({ positions: { head: pos("head", 1000) }, headHistory: history(1.5, 8, 1000) });
    const r = eta(e, 2000);
    assert.equal(r.kind, "arriving");
    if (r.kind !== "arriving") return;
    assert.ok(r.minMin <= 40 && 40 <= r.maxMin, `40 min fuera de ${r.minMin}–${r.maxMin}`);
    assert.equal(r.speedMeasured, true);
  });

  it("gives no time when the head has been silent for over 5 min", () => {
    const stale = NOW - 8 * MIN;
    const e = state({ positions: { head: pos("head", 1000, stale) }, headHistory: [{ metres: 1000, ts: stale }] });
    const r = eta(e, 2000);
    assert.equal(r.kind, "no_signal");
    if (r.kind === "no_signal") assert.equal(r.agoMin, 8);
  });

  it("says «here» when the head is less than 120 m away", () => {
    const e = state({ positions: { head: pos("head", 1950) } });
    assert.equal(eta(e, 2000).kind, "here");
  });

  it("tells «the head passed» from «everything passed»", () => {
    const base = { head: pos("head", 3000) };
    const missing = eta(state({ positions: { ...base, tail: pos("tail", 1500) } }), 2000);
    const pass = eta(state({ positions: { ...base, tail: pos("tail", 2500) } }), 2000);
    assert.equal(missing.kind, "passed");
    assert.equal(pass.kind, "passed");
    if (missing.kind === "passed") assert.equal(missing.tailPassed, false);
    if (pass.kind === "passed") assert.equal(pass.tailPassed, true);
  });

  it("says when it finishes passing, using the tail", () => {
    const e = state({
      positions: { head: pos("head", 3000), tail: pos("tail", 1500) },
      headHistory: history(1.5, 8, 3000),
    });
    const r = eta(e, 2000);
    assert.equal(r.kind, "passed");
    if (r.kind === "passed") assert.ok(r.tailIn && r.tailIn.minMin <= 20 && 20 <= r.tailIn.maxMin);
  });

  it("stopped: says so instead of promising a time", () => {
    const idle = Array.from({ length: 40 }, (_, i) => ({ metres: 1000, ts: NOW - (39 - i) * 20_000 }));
    const e = state({ positions: { head: pos("head", 1000) }, headHistory: idle });
    assert.equal(eta(e, 2000).kind, "stopped");
  });
});
