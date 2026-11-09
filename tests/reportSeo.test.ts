import assert from "node:assert/strict";
import { test } from "node:test";
import { seoSnapshot, type SeoRaw } from "../src/lib/reportSeo.ts";

const empty: SeoRaw = { start: "2026-10-10", end: "2026-11-09", audits: [], onpage: [], snaps: [], cards: null, maps: [], scans: [] };

test("no SEO data at all means no block", () => {
  assert.equal(seoSnapshot(empty), null);
  assert.equal(seoSnapshot({ ...empty, cards: [] }), null);
});

test("site health uses full crawls up to the report's end, against the last one before it started", () => {
  const audits = [
    { status: "done", score: 90, created_at: "2026-11-20T00:00:00Z", pages: 300, result: null }, // after the report
    { status: "done", score: null, created_at: "2026-11-05T00:00:00Z", pages: 40, result: { partial: "The homepage didn't load." } },
    { status: "done", score: 82, created_at: "2026-11-01T00:00:00Z", pages: 312, result: { issues: [{ severity: "high" }, { severity: "low" }] } },
    { status: "done", score: 76, created_at: "2026-10-01T00:00:00Z", pages: 300, result: null },
  ];
  assert.deepEqual(seoSnapshot({ ...empty, audits })!.site, { score: 82, before: 76, pages: 312, high: 1 });
});

test("on-page: the latest audit of each page and keyword, worst first", () => {
  const onpage = [
    { url: "a", keyword: "k", score: 70, top_score: 80, created_at: "2026-11-02T00:00:00Z", status: "done" },
    { url: "a", keyword: "k", score: 50, top_score: 80, created_at: "2026-10-02T00:00:00Z", status: "done" },
    { url: "b", keyword: "k2", score: 60, top_score: 90, created_at: "2026-11-03T00:00:00Z", status: "done" },
    { url: "c", keyword: "k3", score: null, top_score: null, created_at: "2026-11-03T00:00:00Z", status: "failed" },
  ];
  const s = seoSnapshot({ ...empty, onpage })!.onpage!;
  assert.deepEqual([s.pages, s.avg, s.topAvg, s.worst.map((w) => w.url)], [2, 65, 85, ["b", "a"]]);
});

test("backlinks compare the snapshot at the end with the last one before the start", () => {
  const snaps = [{ day: "2026-11-08", domains: 412, backlinks: 3960, rank: 42 }, { day: "2026-10-03", domains: 390, backlinks: 3500, rank: 41 }, { day: "2026-11-12", domains: 999, backlinks: 1, rank: 1 }];
  assert.deepEqual(seoSnapshot({ ...empty, snaps })!.backlinks, { domains: 412, before: 390, backlinks: 3960, rank: 42 });
});

test("links won in the report's dates, links gone, and contacted", () => {
  const cards = [
    { stage: "won", stage_at: "2026-10-20T00:00:00Z", link_live: true },
    { stage: "won", stage_at: "2026-09-01T00:00:00Z", link_live: false },
    { stage: "contacted", stage_at: null, link_live: null },
    { stage: "prospect", stage_at: null, link_live: null },
  ];
  assert.deepEqual(seoSnapshot({ ...empty, cards })!.links, { won: 2, wonInPeriod: 1, gone: 1, contacted: 3 });
});

test("content map counts and local ranks per keyword against the scan before", () => {
  const maps = [{ created_at: "2026-11-01T00:00:00Z", result: { topics: [{ status: "covered" }, { status: "missing" }, { status: "missing" }, { status: "overlap" }] } }];
  const scans = [
    { keyword: "dentist", created_at: "2026-11-06T00:00:00Z", result: { avg: 4.2, top3: 20, read: 49 } },
    { keyword: "dentist", created_at: "2026-10-01T00:00:00Z", result: { avg: 6.1, top3: 12, read: 49 } },
    { keyword: "implants", created_at: "2026-11-06T00:00:00Z", result: { avg: null, top3: 0, read: 0 } },
  ];
  const s = seoSnapshot({ ...empty, maps, scans })!;
  assert.deepEqual(s.map, { covered: 1, missing: 2, overlap: 1, progress: 0 });
  assert.deepEqual(s.local, [{ keyword: "dentist", avg: 4.2, before: 6.1, top3: 20, read: 49 }]);
});
