import assert from "node:assert/strict";
import { test } from "node:test";
import { seoSnapshot, type SeoRaw } from "../src/lib/reportSeo.ts";

const empty: SeoRaw = { start: "2026-10-10", end: "2026-11-09", maps: [], scans: [] };

test("no SEO data at all means no block", () => {
  assert.equal(seoSnapshot(empty), null);
  assert.equal(seoSnapshot({ ...empty, locations: [] }), null);
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
