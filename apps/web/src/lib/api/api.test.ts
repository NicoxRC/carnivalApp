import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parsePositionsResult, parseSession, parseSessionUser } from "@/lib/api/auth";
import { slugId } from "@/components/admin/common";
import { parseTeam, parseTeamUser } from "@/lib/api/admin";
import { parseAdminBusinesses, parseBusinesses } from "@/lib/api/businesses";
import { DEV_API, apiUrl, resolveApiBase } from "@/lib/api/client";
import { parseDensity } from "@/lib/api/density";
import { parsePhotos, parsePushStatus, parseUploadGrant } from "@/lib/api/photos";
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

const DENSITY_API = {
  bins: [
    { bin: 3, fromM: 300, toM: 400, count: 12, level: "busy" },
    { bin: 4, fromM: 400, toM: 500, count: 4, level: "calm" },
  ],
  total: 64,
  enough: true,
  windowMin: 5,
  serverTs: 3000,
};

describe("the crowd map from the API", () => {
  it("reads the stretches with enough sample", () => {
    assert.deepEqual(parseDensity(DENSITY_API), DENSITY_API);
  });

  it("reads «not enough sample» as an empty map, not as an error", () => {
    const d = parseDensity({ ...DENSITY_API, bins: [], total: 7, enough: false });
    assert.equal(d.enough, false);
    assert.equal(d.total, 7);
    assert.deepEqual(d.bins, []);
  });

  it("drops only the stretch with an unknown level and fails without the total", () => {
    const odd = { ...DENSITY_API.bins[0], bin: 9, level: "packed" };
    const d = quietly(() => parseDensity({ ...DENSITY_API, bins: [odd, DENSITY_API.bins[1]] }));
    assert.deepEqual(
      d.bins.map((b) => b.bin),
      [4],
    );
    const { total: _, ...noTotal } = DENSITY_API;
    assert.throws(() => parseDensity(noTotal), /total/);
  });
});

const PHOTO_API = {
  id: "0b6f6b1e-0000-4000-8000-000000000001",
  paradeId: "d31-1",
  metres: 500,
  state: "approved",
  createdAt: 1000,
  url: "/api/photos/0b6f6b1e-0000-4000-8000-000000000001",
};

describe("photos and push from the API", () => {
  const base = "https://api.example.co";

  it("reads the wall, making API paths absolute and leaving bucket URLs alone", () => {
    const signed = "https://acc.r2.cloudflarestorage.com/b/photos/x.jpg?X-Amz-Signature=abc";
    const [fromApi, fromBucket] = parsePhotos({ photos: [PHOTO_API, { ...PHOTO_API, metres: null, url: signed }] }, base);
    assert.equal(fromApi.url, `${base}${PHOTO_API.url}`);
    assert.equal(fromBucket.url, signed);
    assert.equal(fromBucket.metres, null);
  });

  it("drops only the photo with an unknown state", () => {
    const photos = quietly(() => parsePhotos({ photos: [{ ...PHOTO_API, state: "maybe" }, PHOTO_API] }, base));
    assert.equal(photos.length, 1);
  });

  it("reads the upload permission and fails without its token", () => {
    const grant = {
      id: PHOTO_API.id,
      uploadUrl: `/api/photos/uploads/${PHOTO_API.id}?token=t`,
      contentType: "image/jpeg",
      token: "t",
      expiresAt: 5000,
    };
    assert.equal(parseUploadGrant(grant, base).uploadUrl, `${base}${grant.uploadUrl}`);
    const { token: _, ...noToken } = grant;
    assert.throws(() => parseUploadGrant(noToken, base), /token/);
  });

  it("reads the push status with and without keys", () => {
    assert.deepEqual(parsePushStatus({ configured: true, key: "BPub" }), { configured: true, key: "BPub" });
    assert.deepEqual(parsePushStatus({ configured: false, key: null }), { configured: false, key: null });
    assert.throws(() => parsePushStatus({ configured: "yes", key: null }), /configured/);
  });
});

const USER_API = {
  id: "0b6f6b1e-0000-4000-8000-000000000002",
  email: "ana@example.com",
  name: "Ana",
  roles: ["reporter"],
  permissions: ["positions:own"],
  post: "head",
};

describe("the team's session from the API", () => {
  it("reads the login and the user with their post", () => {
    const session = parseSession({ token: "jwt", expiresAt: 9000, user: USER_API });
    assert.equal(session.token, "jwt");
    assert.deepEqual(session.user, USER_API);
    assert.equal(parseSessionUser({ ...USER_API, roles: ["admin"], post: null }).post, null);
  });

  it("fails with an unknown post or a permission that is not text", () => {
    assert.throws(() => parseSessionUser({ ...USER_API, post: "front" }), /post/);
    assert.throws(() => parseSessionUser({ ...USER_API, permissions: [1] }), /permissions/);
    assert.throws(() => parseSession({ token: "jwt", user: USER_API }), /expiresAt/);
  });

  it("reads the answer to the positions, including «backup»", () => {
    const answer = { saved: 0, discarded: 2, waiting: true, serverTs: 1234 };
    assert.deepEqual(parsePositionsResult(answer), answer);
    assert.throws(() => parsePositionsResult({ ...answer, waiting: undefined }), /waiting/);
  });
});

const TEAM_USER_API = {
  id: "0b6f6b1e-0000-4000-8000-000000000003",
  email: "ana@example.com",
  name: "Ana",
  roles: ["coordinator", "reporter"],
  post: "tail",
  active: true,
  lastSignalAt: null,
  createdAt: 1000,
};

describe("the admin panel's data from the API", () => {
  it("reads a team member with roles and post", () => {
    assert.deepEqual(parseTeam([TEAM_USER_API]), [TEAM_USER_API]);
    assert.equal(parseTeamUser({ ...TEAM_USER_API, roles: ["editor"], post: null }).post, null);
  });

  it("fails with an unknown role or post", () => {
    assert.throws(() => parseTeamUser({ ...TEAM_USER_API, roles: ["boss"] }), /role/);
    assert.throws(() => parseTeamUser({ ...TEAM_USER_API, post: "side" }), /post/);
  });

  it("reads the admin businesses, hidden ones and their counters included", () => {
    const hidden = { ...BUSINESS_API, id: "closed", visible: false };
    const parsed = parseAdminBusinesses({
      businesses: [BUSINESS_API, hidden],
      metrics: { "cafe-1": { card: 12, whatsapp: 3 } },
    });
    assert.deepEqual(
      parsed.businesses.map((b) => [b.id, b.visible]),
      [
        ["cafe-1", true],
        ["closed", false],
      ],
    );
    assert.deepEqual(parsed.metrics, { "cafe-1": { card: 12, whatsapp: 3 } });
    assert.deepEqual(parseAdminBusinesses({ businesses: [] }).metrics, {});
    assert.throws(() => parseAdminBusinesses({ businesses: [], metrics: { x: { card: "12" } } }), /card/);
  });

  it("builds ids from names the way the backend accepts them", () => {
    assert.equal(slugId("Desfile Magno", []), "desfile-magno");
    assert.equal(slugId("Café «La Ñapa»!", []), "cafe-la-napa");
    assert.equal(slugId("Desfile Magno", ["desfile-magno", "desfile-magno-2"]), "desfile-magno-3");
    assert.equal(slugId("¡¡!!", []), "item");
    assert.match(slugId("x".repeat(80), []), /^[a-z0-9][a-z0-9-]{0,39}$/);
  });
});
