import { test } from "node:test";
import assert from "node:assert/strict";
import { chanceOf, expectedCtr, findOpportunities, ga4DbRows, gscDbRows, gscWindows, pagePath, type PageAgg } from "../src/lib/seoAnalytics.ts";

test("Search Console URLs and GA4 paths join on the same page path", () => {
  assert.equal(pagePath("https://www.Momos.com/Blog/NPS/?utm_source=x#top"), "/blog/nps");
  assert.equal(pagePath("/blog/nps?ref=chatgpt.com"), "/blog/nps");
  assert.equal(pagePath("https://momos.com/"), "/");
  assert.equal(pagePath("https://momos.com"), "/");
  assert.equal(pagePath("/guides//index.html"), "/guides");
  assert.equal(pagePath("(not set)"), "/");
  assert.equal(pagePath("/caf%C3%A9"), "/café");
});

test("the usual click rate falls with position and blends between spots", () => {
  assert.ok(expectedCtr(1) > expectedCtr(2) && expectedCtr(2) > expectedCtr(5) && expectedCtr(5) > expectedCtr(15));
  assert.ok(Math.abs(expectedCtr(1.5) - (expectedCtr(1) + expectedCtr(2)) / 2) < 1e-9);
  assert.ok(expectedCtr(40) > 0 && expectedCtr(40) < expectedCtr(20));
  assert.equal(expectedCtr(0), expectedCtr(1));
});

test("a query is tagged Low CTR, Page 2 or Winning", () => {
  assert.equal(chanceOf({ query: "a", clicks: 250, impressions: 18_900, position: 8.4 }), "low_ctr");
  assert.equal(chanceOf({ clicks: 268, impressions: 22_400, position: 12.1 }), "page2");
  assert.equal(chanceOf({ clicks: 4000, impressions: 31_200, position: 2.2 }), "winning");
  assert.equal(chanceOf({ clicks: 3, impressions: 40, position: 12 }), null, "too few impressions to say");
  assert.equal(chanceOf({ clicks: 50, impressions: 1000, position: 35 }), null);
});

const page = (p: string, o: Partial<PageAgg> = {}): PageAgg => ({ page: p, clicks: 0, impressions: 0, position: null, sessions: 0, conversions: 0, ai_sessions: 0, ...o });

test("Opportunities find weak click rates, page 2, lost clicks, split pages and new topics", () => {
  const opps = findOpportunities({
    days: 28,
    queries: [
      { query: "restaurant guest feedback", clicks: 300, impressions: 18_900, position: 8.4 },
      { query: "review management software", clicks: 200, impressions: 22_400, position: 12.1 },
      { query: "nps survey template", clicks: 70, impressions: 2000, position: 6 },
      { query: "restaurant feedback form free", clicks: 0, impressions: 300, position: 31 },
      { query: "restaurant feedback form template", clicks: 0, impressions: 250, position: 28 },
      { query: "printable restaurant feedback form", clicks: 0, impressions: 200, position: 40 },
    ],
    pages: [page("/guest-feedback", { clicks: 300, sessions: 2000, conversions: 40 }), page("/blog/review-management-software", { clicks: 200, sessions: 1000, conversions: 14 }), page("/blog/survey", { clicks: 100, position: 11 })],
    pagesPrev: [page("/blog/survey", { clicks: 400, position: 6 })],
    queryPages: [
      { query: "restaurant guest feedback", page: "/guest-feedback", clicks: 300, impressions: 18_900, position: 8.4 },
      { query: "review management software", page: "/blog/review-management-software", clicks: 200, impressions: 22_400, position: 12.1 },
      { query: "nps survey template", page: "/blog/nps", clicks: 35, impressions: 1000, position: 6 },
      { query: "nps survey template", page: "/blog/survey", clicks: 35, impressions: 1000, position: 7 },
    ],
  });
  const kinds = new Map([...opps].reverse().map((o) => [o.kind, o])); // the first of each kind
  const low = kinds.get("low_ctr")!;
  assert.equal(low.query, "restaurant guest feedback");
  assert.equal(low.page, "/guest-feedback");
  assert.ok(low.gain_clicks > 200 && low.gain_signups! > 0, "gains use the page's GA4 conversion rate");
  assert.equal(kinds.get("page2")?.query, "review management software");
  assert.equal(kinds.get("losing")?.page, "/blog/survey");
  assert.ok(kinds.get("cannibal")?.why.includes("/blog/nps"));
  assert.equal(kinds.get("new_topic")?.query, "restaurant feedback form free");
  for (let i = 1; i < opps.length; i++) assert.ok(opps[i - 1].gain_clicks + (opps[i - 1].gain_signups ?? 0) * 25 >= opps[i].gain_clicks + (opps[i].gain_signups ?? 0) * 25);
});

test("Search Console and GA4 rows map to saved rows", () => {
  const gsc = gscDbRows([
    { keys: ["2026-11-01", "https://momos.com/Blog/X/", "NPS Formula"], clicks: 3, impressions: 100, ctr: 0.03, position: 4 },
    { keys: ["2026-11-01", "https://www.momos.com/blog/x", "nps formula"], clicks: 1, impressions: 100, ctr: 0.01, position: 6 },
  ]);
  assert.deepEqual(gsc, [{ day: "2026-11-01", page: "/blog/x", query: "nps formula", clicks: 4, impressions: 200, position: 5 }]);
  const ga4 = ga4DbRows(
    [{ date: "20261101", page: "/blog/x?utm=1", sessions: 10, conversions: 2 }],
    [
      { date: "20261101", page: "/blog/x", source: "chatgpt.com", sessions: 3 },
      { date: "20261101", page: "/blog/x", source: "example.com", sessions: 9 },
    ],
  );
  assert.deepEqual(ga4, [{ day: "2026-11-01", page: "/blog/x", sessions: 10, conversions: 2, ai_sessions: 3, ai: { ChatGPT: 3 } }]);
});

test("the sync fetches the newest days first, then walks back to 16 months", () => {
  const first = gscWindows({ gsc_from: null, gsc_to: null, backfilled: false }, "2026-11-26");
  assert.deepEqual(first.newest, ["2026-10-25", "2026-11-23"]);
  const next = gscWindows({ gsc_from: "2026-10-25", gsc_to: "2026-11-23", backfilled: false }, "2026-11-26");
  assert.equal(next.newest, null);
  assert.deepEqual(next.older, ["2026-09-25", "2026-10-24"]);
  const daily = gscWindows({ gsc_from: "2025-07-31", gsc_to: "2026-11-22", backfilled: true }, "2026-11-26");
  assert.deepEqual(daily.newest, ["2026-11-23", "2026-11-23"]);
  assert.equal(daily.older, null);
  assert.equal(gscWindows({ gsc_from: "2025-07-31", gsc_to: "2026-11-23", backfilled: true }, "2026-11-26").done, true);
});
