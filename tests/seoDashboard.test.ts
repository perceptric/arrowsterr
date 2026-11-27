import { test } from "node:test";
import assert from "node:assert/strict";
import { channelMix, channelName, daySeries, movers, periodTotals, rankBucket, rankWeeks, trendPoints } from "../src/lib/seoAnalytics.ts";

test("daySeries fills every day and keeps GA4 empty without a property", () => {
  const rows = [
    { day: "2026-11-01", clicks: 10, impressions: 200, position: 8, sessions: 30, conversions: 2 },
    { day: "2026-11-03", clicks: 0, impressions: 50, position: 14 },
  ];
  const with4 = daySeries(rows, "2026-11-01", 3, true);
  assert.equal(with4.length, 3);
  assert.deepEqual(with4[0], { clicks: 10, impressions: 200, ctr: 0.05, position: 8, sessions: 30, conversions: 2 });
  assert.deepEqual(with4[1], { clicks: 0, impressions: 0, ctr: null, position: null, sessions: 0, conversions: 0 }, "a missing day is zero");
  assert.equal(with4[2].ctr, 0);
  const without = daySeries(rows, "2026-11-01", 3, false);
  assert.equal(without[0].sessions, null);
  assert.equal(without[0].conversions, null);
});

test("periodTotals adds counts and weights position by impressions", () => {
  const pts = daySeries(
    [
      { day: "2026-11-01", clicks: 10, impressions: 100, position: 4, sessions: 20, conversions: 1 },
      { day: "2026-11-02", clicks: 30, impressions: 300, position: 8, sessions: 40, conversions: 3 },
    ],
    "2026-11-01",
    3,
    true,
  );
  assert.deepEqual(periodTotals(pts), { clicks: 40, impressions: 400, ctr: 0.1, position: 7, sessions: 60, conversions: 4 });
  const none = periodTotals(daySeries([], "2026-11-01", 7, false));
  assert.deepEqual(none, { clicks: 0, impressions: 0, ctr: null, position: null, sessions: null, conversions: null });
});

test("movers ranks the biggest gains and losses, counting missing keys as 0", () => {
  const now = [{ key: "a", clicks: 50 }, { key: "b", clicks: 5 }, { key: "new", clicks: 20 }, { key: "same", clicks: 7 }];
  const before = [{ key: "a", clicks: 10 }, { key: "b", clicks: 25 }, { key: "gone", clicks: 30 }, { key: "same", clicks: 7 }];
  const m = movers(now, before, 2);
  assert.deepEqual(m.up.map((x) => [x.key, x.change]), [["a", 40], ["new", 20]]);
  assert.deepEqual(m.down.map((x) => [x.key, x.change]), [["gone", -30], ["b", -20]]);
  assert.deepEqual(m.down[0], { key: "gone", clicks: 0, before: 30, change: -30 });
});

test("trendPoints folds days into equal buckets and skips days outside the range", () => {
  const rows = [
    { day: "2026-11-01", clicks: 1 },
    { day: "2026-11-02", clicks: 2 },
    { day: "2026-11-04", clicks: 4 },
    { day: "2026-10-31", clicks: 99 },
    { day: "2026-11-05", clicks: 99 },
  ];
  assert.deepEqual(trendPoints(rows, "2026-11-01", 4, 2), [3, 4]);
  assert.deepEqual(trendPoints([], "2026-11-01", 28), new Array(12).fill(0));
});

test("channelName puts GA4 channel groups in plain words", () => {
  assert.equal(channelName("Organic Search"), "Organic search");
  assert.equal(channelName(" Direct "), "Direct");
  assert.equal(channelName("Organic Social"), "Social");
  assert.equal(channelName("Paid Search"), "Paid search");
  assert.equal(channelName("Unassigned"), "Other");
});

test("channelMix moves AI visits out of Referral and sorts biggest first", () => {
  const rows = [
    { channel: "Organic Search", sessions: 500 },
    { channel: "Referral", sessions: 120 },
    { channel: "Direct", sessions: 200 },
    { channel: "Organic Social", sessions: 30 },
    { channel: "Paid Social", sessions: 10 },
    { channel: "Email", sessions: 0 },
  ];
  assert.deepEqual(channelMix(rows, 80), [
    { channel: "Organic search", sessions: 500 },
    { channel: "Direct", sessions: 200 },
    { channel: "AI assistants", sessions: 80 },
    { channel: "Referral", sessions: 40 },
    { channel: "Social", sessions: 40 },
  ]);
  const capped = channelMix([{ channel: "Referral", sessions: 10 }], 50);
  assert.deepEqual(capped, [{ channel: "AI assistants", sessions: 10 }], "never moves more than Referral has");
  assert.deepEqual(channelMix([], 0), []);
});

test("rankBucket matches the SQL cut points", () => {
  assert.equal(rankBucket(1), "top3");
  assert.equal(rankBucket(3.4), "top3");
  assert.equal(rankBucket(3.5), "top10");
  assert.equal(rankBucket(10.4), "top10");
  assert.equal(rankBucket(10.5), "top20");
  assert.equal(rankBucket(20.4), "top20");
  assert.equal(rankBucket(20.5), null);
});

test("rankWeeks lays the weeks out oldest first with empty weeks as 0", () => {
  const w = rankWeeks(
    [
      { week_back: 0, bucket: "top3", queries: 4 },
      { week_back: 0, bucket: "top10", queries: 9 },
      { week_back: 2, bucket: "top20", queries: 6 },
      { week_back: 5, bucket: "top3", queries: 1 },
      { week_back: 1, bucket: "other", queries: 3 },
    ],
    3,
  );
  assert.deepEqual(w, [
    { top3: 0, top10: 0, top20: 6 },
    { top3: 0, top10: 0, top20: 0 },
    { top3: 4, top10: 9, top20: 0 },
  ]);
});
