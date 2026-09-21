import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";
import { displayDate } from "../extensions/brand-portal/src/display-date.js";

test("statement calendar dates retain their day across timezones", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["America/New_York", "America/Los_Angeles", "UTC", "Pacific/Auckland"]) {
      process.env.TZ = zone;
      assert.equal(displayDate("2026-09-15"), new Date("2026-09-15T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC" }));
    }
    process.env.TZ = "America/New_York";
    assert.equal(displayDate("2026-09-15T00:00:00Z"), new Date("2026-09-15T00:00:00Z").toLocaleDateString());
    assert.equal(displayDate(null), "Not available");
    assert.equal(displayDate("invalid"), "invalid");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
