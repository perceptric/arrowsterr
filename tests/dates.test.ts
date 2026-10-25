import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, formatDate } from "../src/lib/dates.ts";

// Local times, so the tests pass in any time zone.
const NOW = new Date(2026, 9, 25, 15, 0).getTime();
const min = 60_000;
const hour = 60 * min;

test("ago: just now, minutes and hours", () => {
  assert.equal(ago(NOW, NOW), "just now");
  assert.equal(ago(NOW - 30_000, NOW), "just now");
  assert.equal(ago(NOW + 5 * min, NOW), "just now"); // a clock a little ahead
  assert.equal(ago(NOW - 5 * min, NOW), "5 min ago");
  assert.equal(ago(NOW - 59 * min, NOW), "59 min ago");
  assert.equal(ago(NOW - 2 * hour, NOW), "2 h ago");
  assert.equal(ago(NOW - 90 * min, NOW), "1 h ago");
  assert.equal(ago(new Date(NOW - 3 * hour).toISOString(), NOW), "3 h ago");
});

test("ago: yesterday, then the date", () => {
  assert.equal(ago(new Date(2026, 9, 24, 9, 0).getTime(), NOW), "Yesterday");
  assert.equal(ago(new Date(2026, 9, 23, 23, 0).getTime(), NOW), "Oct 23");
  assert.equal(ago(new Date(2026, 9, 3, 12, 0).getTime(), NOW), "Oct 3");
  assert.equal(ago(new Date(2025, 9, 3, 12, 0).getTime(), NOW), "Oct 3, 2025");
});

test("ago: missing or bad dates print as a dash", () => {
  assert.equal(ago(null, NOW), "–");
  assert.equal(ago(undefined, NOW), "–");
  assert.equal(ago("", NOW), "–");
  assert.equal(ago("not a date", NOW), "–");
});

test("formatDate: the year only when it isn't this year, unless asked", () => {
  assert.equal(formatDate(new Date(2026, 9, 3), { now: NOW }), "Oct 3");
  assert.equal(formatDate(new Date(2025, 0, 15), { now: NOW }), "Jan 15, 2025");
  assert.equal(formatDate(new Date(2026, 9, 3), { now: NOW, year: true }), "Oct 3, 2026");
  assert.equal(formatDate(new Date(2025, 0, 15), { now: NOW, year: false }), "Jan 15");
  assert.equal(formatDate(null), "–");
});
