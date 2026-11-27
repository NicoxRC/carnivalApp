import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { todayInPasto, minuteOfDayInPasto, normalizeTime, dateParts } from "@/lib/dates";
import { timeAgo, timeOfDay } from "@/lib/format";
import { translate } from "@/lib/i18n-texts";
import { projectOnCourse, pointAtMetre, describePosition, COURSE } from "@/lib/course";
import type { Parade } from "@/lib/types";

describe("dates in Pasto time", () => {
  it("at 8 p.m. in Pasto it is still today, even if it is tomorrow in UTC", () => {
    const ts = Date.UTC(2027, 0, 1, 1, 0);
    assert.equal(todayInPasto(ts), "2026-12-31");
    assert.equal(minuteOfDayInPasto(ts), 20 * 60);
  });

  it("the weekday does not depend on the time zone", () => {
    assert.deepEqual(dateParts("2026-12-31"), { shortDay: "JUE", dayNumber: "31", long: "31 de diciembre" });
  });

  it("formats times", () => {
    assert.equal(normalizeTime("9:00"), "09:00");
    assert.equal(timeOfDay("14:30"), "2:30 p. m.");
    assert.equal(timeOfDay("00:05"), "12:05 a. m.");
  });

  it("«time ago» never says a negative time", () => {
    assert.equal(timeAgo(1000, 0), "ahora mismo");
    assert.equal(timeAgo(0, 125_000), "hace 2 min");
    assert.equal(timeAgo(0, 125_000, (c, v) => translate("en", c, v)), "2 min ago");
  });
});

describe("the course is 1D", () => {
  it("a point of the course comes back to its own metre", () => {
    for (const m of [0, 500, 2000, COURSE.lengthMetres - 10]) {
      const p = pointAtMetre(m);
      const projection = projectOnCourse(p.lat, p.lng);
      assert.ok(Math.abs(projection.metres - m) < 2, `metre ${m} came back as ${projection.metres}`);
      assert.ok(projection.offsetM < 2);
    }
  });

  it("waypoints are sorted by distance along the course", () => {
    const metres = COURSE.waypoints.map((h) => h.metres);
    assert.deepEqual(metres, [...metres].sort((a, b) => a - b));
  });

  it("names where it is, in both languages", () => {
    const h = COURSE.waypoints[2];
    assert.equal(describePosition(h.metres).phrase, `va por ${h.name}`);
    assert.equal(describePosition(h.metres, "it", (c, v) => translate("en", c, v)).phrase, `passing ${h.name}`);
  });

});
