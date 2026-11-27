import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBusinesses } from "@/lib/api/businesses";
import { DEV_API, apiUrl, resolveApiBase } from "@/lib/api/client";
import { positionForApi } from "@/lib/api/positions";
import { parseProgress, parseSchedule } from "@/lib/api/schedule";
import { parseParadeState } from "@/lib/api/state";
import type { PositionInput } from "@/lib/types";

function quietly<T>(f: () => T): T {
  const original = console.warn;
  console.warn = () => undefined;
  try {
    return f();
  } finally {
    console.warn = original;
  }
}

describe("where the API is", () => {
  it("builds the URL from the configured base, without extra slashes", () => {
    const base = resolveApiBase("https://api.example.co/", false);
    assert.equal(apiUrl("/api/state", base), "https://api.example.co/api/state");
    assert.equal(apiUrl("api/state", base), "https://api.example.co/api/state");
  });

  it("without NEXT_PUBLIC_API_URL uses localhost in development and fails in production", () => {
    assert.equal(resolveApiBase(undefined, true), DEV_API);
    assert.equal(resolveApiBase("  ", false), null);
    assert.throws(() => apiUrl("/api/state", null), /NEXT_PUBLIC_API_URL/);
  });
});

const STATE_API = {
  paradeId: "d31-1",
  name: "Desfile de Años Viejos",
  state: "in_progress",
  date: "2026-12-31",
  startTime: "14:00",
  courseId: "provisional-pasto-course",
  positions: {
    head: { post: "head", lat: 1.21, lng: -77.28, metres: 1200, accuracyM: 8, ts: 2000 },
    tail: { post: "tail", lat: 1.2, lng: -77.27, metres: 400, accuracyM: null, ts: 1900 },
  },
  headHistory: [
    { metres: 1100, ts: 1000 },
    { metres: 1200, ts: 2000 },
  ],
  announcements: [{ id: "a1", text: "Arranca tarde", level: "alert", createdAt: 500, expiresAt: null }],
  serverTs: 2100,
};

describe("the parade state from the API", () => {
  it("is read field by field", () => {
    const s = parseParadeState(STATE_API);
    assert.equal(s.paradeId, "d31-1");
    assert.equal(s.state, "in_progress");
    assert.equal(s.positions.head?.metres, 1200);
    assert.equal(s.positions.tail?.accuracyM, null);
    assert.equal(s.positions.middle, undefined);
    assert.equal(s.headHistory.length, 2);
    assert.equal(s.announcements[0].level, "alert");
    assert.equal(s.serverTs, 2100);
  });

  it("fails with a missing field, an unknown value or a post under the wrong key", () => {
    const { serverTs: _, ...noClock } = STATE_API;
    assert.throws(() => parseParadeState(noClock), /serverTs/);
    assert.throws(() => parseParadeState({ ...STATE_API, state: "paused" }), /state/);
    const swapped = { ...STATE_API, positions: { head: STATE_API.positions.tail } };
    assert.throws(() => parseParadeState(swapped), /positions\.head/);
  });
});

describe("positions sent to the API", () => {
  const input: PositionInput = { paradeId: "d31-1", post: "middle", lat: 1.21, lng: -77.28, accuracyM: 6, ts: 1000 };

  it("carry the post and not the parade id", () => {
    assert.deepEqual(positionForApi(input), { post: "middle", lat: 1.21, lng: -77.28, accuracyM: 6, ts: 1000 });
    assert.equal(positionForApi({ ...input, accuracyM: undefined, ts: undefined }).accuracyM, null);
  });
});

const EVENT_API = {
  id: "stage-1",
  date: "2027-01-04",
  startTime: "18:00",
  endTime: null,
  title: "Concierto",
  description: "En la plaza",
  category: "stage",
  placeName: "Plaza de Nariño",
  lat: 1.21,
  lng: -77.28,
  sponsored: true,
};

const SCHEDULE_API = {
  parades: [{ id: "d31-1", name: "Años Viejos", date: "2026-12-31", startTime: "14:00", state: "scheduled" }],
  events: [EVENT_API, { ...EVENT_API, id: "tasca-1", category: "tasca", endTime: "22:00", lat: null, lng: null }],
  today: "2026-12-31",
  currentId: "d31-1",
};

describe("the schedule from the API", () => {
  it("reads a parade with its events", () => {
    const s = parseSchedule(SCHEDULE_API);
    assert.deepEqual(s.parades, SCHEDULE_API.parades);
    assert.equal(s.events[0].category, "stage");
    assert.equal(s.events[1].endTime, "22:00");
    assert.equal(s.events[1].lat, null);
    assert.equal(s.today, "2026-12-31");
    assert.equal(s.currentId, "d31-1");
    assert.equal(parseSchedule({ ...SCHEDULE_API, currentId: null }).currentId, null);
  });

  it("drops only the event with an unknown category and fails without the structure", () => {
    const odd = { ...EVENT_API, id: "odd", category: "fireworks" };
    const s = quietly(() => parseSchedule({ ...SCHEDULE_API, events: [odd, EVENT_API] }));
    assert.deepEqual(
      s.events.map((e) => e.id),
      ["stage-1"],
    );
    assert.throws(() => parseSchedule({ ...SCHEDULE_API, parades: null }), /parades/);
  });

  it("reads the progress without the parade next to it", () => {
    const passes = parseProgress({
      parade: SCHEDULE_API.parades[0],
      passes: [
        { waypointId: "w1", name: "Salida", metres: 0, ts: 1000 },
        { waypointId: "w2", name: "Plaza", metres: 900, ts: null },
      ],
    });
    assert.deepEqual(passes[1], { waypointId: "w2", name: "Plaza", metres: 900, ts: null });
    assert.throws(() => parseProgress({ passes: [{ waypointId: "w1", name: "Salida" }] }), /metres/);
  });
});

const BUSINESS_API = {
  id: "cafe-1",
  name: "Café del Carnaval",
  category: "ice_cream",
  description: "Helados",
  address: "Frente a la plaza",
  hours: "8 a 20",
  lat: 1.21,
  lng: -77.28,
  plan: "featured",
  offer: "2x1",
  offerTiming: "after",
  menu: [{ name: "Helado", price: "$5.000" }],
  whatsapp: "573001234567",
  link: "https://example.co",
  visible: true,
};

const NO_PLAN = {
  ...BUSINESS_API,
  id: "toilet-1",
  category: "toilet",
  plan: null,
  offer: null,
  offerTiming: "always",
  menu: [],
  whatsapp: null,
  link: null,
};

describe("the businesses from the API", () => {
  it("reads a business with a plan and a service without one", () => {
    const [withPlan, noPlan] = parseBusinesses({ businesses: [BUSINESS_API, NO_PLAN] });
    assert.deepEqual(withPlan, BUSINESS_API);
    assert.deepEqual(noPlan, NO_PLAN);
  });

  it("drops only the business with an unknown value and fails without the list", () => {
    const odd = { ...BUSINESS_API, id: "odd", plan: "gold" };
    const businesses = quietly(() => parseBusinesses({ businesses: [odd, NO_PLAN] }));
    assert.deepEqual(
      businesses.map((b) => b.id),
      ["toilet-1"],
    );
    assert.throws(() => parseBusinesses({ items: [] }), /businesses/);
  });
});
