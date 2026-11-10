import assert from "node:assert/strict";
import { test } from "node:test";
import { alertSettings, changeAlert, dropAlert, dropConfirmed, newRivals, rankDrop, ratingCrossed, reviewAlert, sameGrid, scanAlerts } from "../src/lib/localAlerts.ts";
import { csv, gridRanks, inShape, localReport, rankColor, type LocalRaw } from "../src/lib/localReport.ts";
import { localAlertEmail, weeklyEmail } from "../src/lib/emails.ts";
import type { Rival, ScanResult } from "../src/lib/local.ts";

const rival = (o: Partial<Rival>): Rival => ({ title: "Bright Smile", cid: "222", domain: null, category: null, rating: 4.9, reviews: 1040, top3: 0, seen: 9, ...o });
const scan = (ranks: (number | null | "x")[], o: Partial<ScanResult> = {}): ScanResult => {
  const points = ranks.map((r, i) => (r === "x" ? { i, rank: null, top: [], error: true } : { i, rank: r, top: [] }));
  const ok = points.filter((p) => !p.error);
  return {
    keyword: "dentist",
    size: 3,
    spacing: 1,
    shape: "square",
    center: { lat: 30.3, lng: -97.7 },
    points,
    rivals: [],
    you: null,
    avg: ok.length ? Math.round((ok.reduce((s, p) => s + Math.min(p.rank ?? 21, 21), 0) / ok.length) * 10) / 10 : null,
    top3: ok.filter((p) => p.rank !== null && p.rank <= 3).length,
    found: ok.filter((p) => p.rank !== null).length,
    read: ok.length,
    ...o,
  };
};

test("alert settings: on unless turned off, a rating level only when it makes sense", () => {
  assert.deepEqual(alertSettings({}), { on: true, ratingBelow: null });
  assert.deepEqual(alertSettings({ alerts: { on: false, ratingBelow: 4.55 } }), { on: false, ratingBelow: 4.6 });
  assert.equal(alertSettings({ alerts: { ratingBelow: 7 } }).ratingBelow, null);
});

test("a rank drop needs the same grid and 2 places or 15 points of top 3 share", () => {
  const before = scan([1, 2, 3, 2, 1, 4, 5, 3, 2]);
  const small = scan([1, 2, 3, 2, 1, 5, 5, 3, 2]);
  assert.equal(rankDrop(small, before), null);
  const worse = scan([1, 6, 9, 2, 1, 12, 5, 3, 2]);
  const d = rankDrop(worse, before)!;
  assert.deepEqual(d.points, [1, 2, 5]);
  assert.deepEqual(d.top3, { now: 56, before: 78 }); // 7 of 9 to 5 of 9 in the top 3
  // Another grid never compares.
  assert.equal(rankDrop(worse, { ...before, spacing: 2 }), null);
  assert.equal(sameGrid(worse, { ...before, center: { lat: 30.31, lng: -97.7 } }), false);
  // A failed point is left out.
  assert.deepEqual(rankDrop(scan([1, "x", 9, 2, 1, 12, 5, 3, 2]), before)!.points, [2, 5]);
});

test("the second read must agree before a drop alerts", () => {
  const before = scan([1, 2, 3, 2, 1, 4, 5, 3, 2]).points;
  assert.equal(dropConfirmed([1, 2, 5], before, { "1": 7, "2": 8, "5": 2 }), true); // 2 of 3 still worse
  assert.equal(dropConfirmed([1, 2, 5], before, { "1": 2, "2": 3, "5": 9 }), false); // back to normal: a blip
  assert.equal(dropConfirmed([1, 2, 5], before, { "1": 9 }), false); // too few points answered
  assert.equal(dropConfirmed([1, 2], before, { "1": null, "2": 3 }), true); // out of the top 20 counts as worse
  assert.equal(dropConfirmed([], before, {}), false);
});

test("a competitor new in the top 3 at 5 points or more; never on a first scan", () => {
  const now = scan([1, 2, 3], { rivals: [rival({ top3: 6 }), rival({ title: "Lone Star", cid: "444", top3: 5 }), rival({ title: "Capital", cid: "333", top3: 4 })] });
  const before = scan([1, 2, 3], { rivals: [rival({ top3: 7 }), rival({ title: "Lone Star", cid: "444", top3: 2 })] });
  assert.deepEqual(newRivals(now, before).map((r) => r.title), ["Lone Star"]);
  assert.deepEqual(newRivals(now, null), []);
  const { alerts } = scanAlerts("s2", now, before);
  assert.equal(alerts[0].key, "new_rival:dentist:444:s2");
  assert.match(alerts[0].title, /Lone Star is in the top 3 for “dentist”/);
});

test("alert texts and keys", () => {
  const d = rankDrop(scan([1, 6, 9, 2, 1, 12, 5, 3, 2]), scan([1, 2, 3, 2, 1, 4, 5, 3, 2]))!;
  const a = dropAlert("s9", "dentist", d);
  assert.equal(a.key, "rank_drop:dentist:s9");
  assert.match(a.detail, /Average rank 2.6 to 4.6, top 3 share 78% to 56%. Worse at 3 points, read twice./);
  assert.equal(changeAlert({ field: "phone", label: "Phone", before: "1", now: "2", seenAt: "", confirmedAt: "" }).key, "profile_change:phone:2");
  const r = reviewAlert({ cid: "111", review_id: "R1", rating: 1, author: "Sam", text: "x".repeat(300) });
  assert.equal(r.title, "New 1 star review from Sam");
  assert.ok(r.detail.length < 250);
  assert.equal(ratingCrossed(4.4, 4.5, 4.5), true);
  assert.equal(ratingCrossed(4.4, 4.4, 4.5), false); // already below: alerted before
  assert.equal(ratingCrossed(4.4, null, 4.5), false); // first read
  assert.equal(ratingCrossed(4.4, 4.6, null), false);
});

test("the location report: keywords with their grid, change, AI share, reviews and alerts in the dates", () => {
  const loc = { title: "Northside Dental", cid: "111", placeId: null, address: "1 Main St", phone: null, category: null, categories: [], lat: 30.3, lng: -97.7, city: "Austin", keywords: ["dentist", "teeth whitening"], spacing: 1, weekly: true, name: "Mueller" };
  const raw: LocalRaw = {
    start: "2026-10-12",
    end: "2026-11-10",
    locations: [{ id: "L1", data: loc }, { id: "L2", data: { ...loc, name: "Round Rock" } }],
    scans: [
      { location_id: "L1", keyword: "dentist", created_at: "2026-11-09T10:00:00Z", result: scan([1, 2, 3, 2, 1, 4, 5, 3, 2], { rivals: [rival({ top3: 9 })] }) },
      { location_id: "L1", keyword: "dentist", created_at: "2026-10-05T10:00:00Z", result: scan([3, 4, 5, 6, 7, 8, 9, 9, 9]) },
      { location_id: "L1", keyword: "dentist", created_at: "2026-11-20T10:00:00Z", result: scan([20, 20, 20, 20, 20, 20, 20, 20, 20]) }, // after the dates
    ],
    profiles: [{ location_id: "L1", read_at: "2026-11-08T00:00:00Z", data: { rating: 4.8, reviews: 412 } }],
    reviews: [{ location_id: "L1", posted_at: "2026-11-01T00:00:00Z" }, { location_id: "L1", posted_at: "2026-09-01T00:00:00Z" }, { location_id: "L1", posted_at: null }],
    ai: [{ location_id: "L1", keyword: "dentist", created_at: "2026-11-01T00:00:00Z", result: { share: 0.6 } }],
    alerts: [{ location_id: "L1", title: "Rank drop", detail: "x", created_at: "2026-11-02T00:00:00Z" }, { location_id: "L1", title: "Old", detail: "x", created_at: "2026-09-02T00:00:00Z" }],
  };
  const [l, ...rest] = localReport(raw);
  assert.equal(rest.length, 0); // Round Rock has no scan
  assert.equal(l.name, "Mueller");
  assert.equal(l.keywords.length, 1);
  const k = l.keywords[0];
  assert.deepEqual([k.avg, k.before, k.top3, k.read, k.aiShare], [2.6, 6.7, 7, 9, 0.6]);
  assert.deepEqual(k.leader, { title: "Bright Smile", top3: 9 });
  assert.equal(k.grid.ranks.length, 9);
  assert.deepEqual([l.rating, l.reviews, l.newReviews], [4.8, 412, 1]);
  assert.deepEqual(l.alerts.map((a) => a.title), ["Rank drop"]);
  assert.deepEqual(gridRanks(scan([1, "x", null])), [1, undefined, null, undefined, undefined, undefined, undefined, undefined, undefined]);
  assert.deepEqual([rankColor(2), rankColor(null), rankColor(undefined)], ["#1F9D55", "#E5484D", "#D9D9D9"]);
  assert.equal(inShape(0, 7, "circle"), false);
  assert.equal(inShape(24, 7, "circle"), true);
});

test("CSV cells are quoted, and formulas stay text", () => {
  assert.equal(csv(["a", "b"], [["x,y", '"q"'], ["=SUM(A1)", null], [3, "@me"]]), 'a,b\n"x,y","""q"""\n"\'=SUM(A1)",\n3,"\'@me"');
});

test("the alert email and the weekly email's Google Maps rows", () => {
  const footer = { text: "You get alerts." };
  const one = localAlertEmail({ brand: "Northside", location: "Northside Dental (Mueller)", alerts: [{ kind: "bad_review", title: "New 1 star review from Sam", detail: "“Slow.”" }], url: "https://app/x" }, footer);
  assert.equal(one.subject, "Northside Dental (Mueller): New 1 star review from Sam");
  assert.match(one.html, /Draft a reply/);
  const many = localAlertEmail({ brand: "Northside", location: "Mueller", alerts: [{ kind: "rank_drop", title: "Rank drop", detail: "d" }, { kind: "new_rival", title: "New", detail: "d" }], url: "https://app/x" }, footer);
  assert.equal(many.subject, "Mueller: 2 Google Maps alerts");
  assert.match(many.text, /Rank drop/);
  const w = weeklyEmail(
    { workspace: "W", from: new Date("2026-11-02"), to: new Date("2026-11-08"), url: "u", appUrl: "a", brands: [{ name: "Northside", visibility: 40, change: 2, byEngine: [], top: [], local: [{ name: "Mueller", keywords: [{ keyword: "dentist", avg: 2.6, change: -1.2 }], newReviews: 3, rating: 4.8, aiShare: 0.6 }] }] },
    footer,
  );
  assert.match(w.text, /Google Maps, Mueller/);
  assert.match(w.text, /up 1.2/);
  assert.match(w.text, /3 new reviews this week/);
  assert.match(w.text, /AI Mode names you at 60% of points/);
});
