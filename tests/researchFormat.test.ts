import { test } from "node:test";
import assert from "node:assert/strict";
import { countOf, shortNum, signed, trendChange } from "../src/lib/researchFormat.ts";

test("trendChange: up, down, no change and new", () => {
  assert.deepEqual(trendChange([100, 80, 112]), { tone: "up", text: "+12% vs 12 months ago" });
  assert.deepEqual(trendChange([200, 150]), { tone: "down", text: "−25% vs 12 months ago" });
  assert.deepEqual(trendChange([100, 100]), { tone: "flat", text: "no change vs 12 months ago" });
  assert.deepEqual(trendChange([0, 40]), { tone: "flat", text: "(new)" });
});

test("trendChange: nothing to compare", () => {
  assert.equal(trendChange([]), null);
  assert.equal(trendChange([50]), null);
  assert.equal(trendChange([0, 0]), null);
});

test("countOf: the total only when the list is cut", () => {
  assert.equal(countOf(100, 12400), "100 of 12.4K");
  assert.equal(countOf(40, 40), "40");
  assert.equal(countOf(40, null), "40");
  assert.equal(countOf(1200, 2_500_000), "1,200 of 2.5M");
});

test("signed: zero is a plain 0, missing is a dash", () => {
  assert.equal(signed(12, "+"), "+12");
  assert.equal(signed(1500, "−"), "−1.5K");
  assert.equal(signed(0, "+"), "0");
  assert.equal(signed(null, "+"), "–");
  assert.equal(shortNum(999), "999");
});
