import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bareHost,
  bingDay,
  bingRows,
  bingSiteForUrl,
  bingSites,
  bingSummary,
  gscRows,
  gscSites,
  gscSummary,
  periodRange,
  pickBingSite,
  pickGscProperty,
  topRows,
  totals,
} from "../src/lib/searchEngines.ts";

const site = (url: string, permission = "siteOwner") => ({ url, permission });

test("bare host drops the scheme, www, path and port", () => {
  assert.equal(bareHost("https://www.Example.com/blog?x=1"), "example.com");
  assert.equal(bareHost("sc-domain:example.com"), "example.com");
  assert.equal(bareHost("example.com:8080"), "example.com");
  assert.equal(bareHost("shop.example.com."), "shop.example.com");
  assert.equal(bareHost(""), "");
});

test("a domain property wins over URL-prefix properties", () => {
  const sites = [site("https://www.example.com/"), site("sc-domain:example.com"), site("http://example.com/")];
  assert.equal(pickGscProperty(sites, "example.com"), "sc-domain:example.com");
  assert.equal(pickGscProperty(sites, "www.example.com"), "sc-domain:example.com");
});

test("without a domain property, the https home page wins, in the www form the brand uses", () => {
  const sites = [site("http://www.example.com/"), site("https://example.com/blog/"), site("https://www.example.com/"), site("https://example.com/")];
  assert.equal(pickGscProperty(sites, "www.example.com"), "https://www.example.com/");
  assert.equal(pickGscProperty(sites, "example.com"), "https://example.com/");
  assert.equal(pickGscProperty([site("http://www.example.com/"), site("https://example.com/blog/")], "example.com"), "http://www.example.com/");
});

test("a subdomain brand takes its own property, then the parent domain property", () => {
  const sites = [site("sc-domain:example.com"), site("https://shop.example.com/")];
  assert.equal(pickGscProperty(sites, "shop.example.com"), "https://shop.example.com/");
  assert.equal(pickGscProperty([site("sc-domain:example.com")], "shop.example.com"), "sc-domain:example.com");
  // A child domain property never covers the parent.
  assert.equal(pickGscProperty([site("sc-domain:shop.example.com")], "example.com"), null);
});

test("other sites and look-alike domains never match", () => {
  const sites = [site("sc-domain:other.com"), site("https://notexample.com/"), site("sc-domain:example.co")];
  assert.equal(pickGscProperty(sites, "example.com"), null);
  assert.equal(pickGscProperty(sites, ""), null);
});

test("Search Console site lists parse with or without response_data, and skip unverified ones", () => {
  const raw = {
    response_data: {
      siteEntry: [
        { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
        { siteUrl: "https://www.example.com/", permissionLevel: "siteUnverifiedUser" },
        { siteUrl: "", permissionLevel: "siteOwner" },
      ],
    },
  };
  assert.deepEqual(gscSites(raw), [{ url: "sc-domain:example.com", permission: "siteOwner" }]);
  assert.deepEqual(gscSites({ siteEntry: [{ siteUrl: "https://a.com/", permissionLevel: "siteFullUser" }] }), [{ url: "https://a.com/", permission: "siteFullUser" }]);
  assert.deepEqual(gscSites(null), []);
  assert.deepEqual(gscSites({ response_data: {} }), []);
});

test("periods end on a lagged day and the one before has the same length", () => {
  const r = periodRange(7, new Date("2026-11-17T15:00:00Z"), 3);
  assert.deepEqual(r, { start: "2026-11-08", end: "2026-11-14", prevStart: "2026-11-01", prevEnd: "2026-11-07" });
  const m = periodRange(30, new Date("2026-03-02T00:30:00Z"));
  assert.equal(m.end, "2026-03-02");
  assert.equal(m.start, "2026-02-01");
  assert.equal(m.prevEnd, "2026-01-31");
});

test("Search Console daily rows add up per period, with position weighted by impressions", () => {
  const r = periodRange(2, new Date("2026-11-10T12:00:00Z"));
  const daily = gscRows({
    response_data: {
      rows: [
        { keys: ["2026-11-07"], clicks: 4, impressions: 100, ctr: 0.04, position: 10 },
        { keys: ["2026-11-08"], clicks: 6, impressions: 100, ctr: 0.06, position: 8 },
        { keys: ["2026-11-09"], clicks: 10, impressions: 300, ctr: 0.033, position: 4 },
        { keys: ["2026-11-10"], clicks: 2, impressions: 100, ctr: 0.02, position: 8 },
      ],
      responseAggregationType: "byProperty",
    },
  });
  const s = gscSummary(daily, r);
  assert.equal(s.current.clicks, 12);
  assert.equal(s.current.impressions, 400);
  assert.equal(s.current.ctr, 3);
  assert.equal(s.current.position, 5);
  assert.equal(s.previous.clicks, 10);
  assert.equal(s.previous.position, 9);
  assert.deepEqual(s.series, [
    { day: "2026-11-09", clicks: 10, impressions: 300 },
    { day: "2026-11-10", clicks: 2, impressions: 100 },
  ]);
});

test("missing days are zero, and an empty reply gives zero totals", () => {
  const r = periodRange(3, new Date("2026-11-10T12:00:00Z"));
  const s = gscSummary(gscRows({ rows: [{ keys: ["2026-11-09"], clicks: "3", impressions: "30" }] }), r);
  assert.deepEqual(s.series.map((d) => d.clicks), [0, 3, 0]);
  assert.deepEqual(gscSummary(gscRows({}), r).current, { clicks: 0, impressions: 0, ctr: 0, position: null });
  assert.deepEqual(totals([]), { clicks: 0, impressions: 0, ctr: 0, position: null });
});

test("top queries sort by clicks and turn the click rate into a percent", () => {
  const rows = gscRows({
    rows: [
      { keys: ["b"], clicks: 1, impressions: 50, ctr: 0.02, position: 7.5 },
      { keys: ["a"], clicks: 9, impressions: 90, ctr: 0.1, position: 2.25 },
      { keys: [""], clicks: 99, impressions: 99, ctr: 1, position: 1 },
    ],
  });
  const top = topRows(rows);
  assert.deepEqual(top.map((t) => t.key), ["a", "b"]);
  assert.equal(top[0].ctr, 10);
  assert.equal(top[0].position, 2.25);
  assert.equal(topRows(rows, 1).length, 1);
});

test("Bing sites parse, and the verified home page for the domain wins", () => {
  const sites = bingSites({
    sites: [
      { url: "https://www.example.com/", is_verified: false },
      { url: "http://www.example.com/", is_verified: true },
      { url: "https://example.com/blog/", is_verified: true },
      { url: "https://other.com/", is_verified: true },
    ],
    skipped_site_count: 0,
  });
  assert.equal(sites.length, 4);
  assert.equal(pickBingSite(sites, "example.com"), "http://www.example.com/");
  assert.equal(pickBingSite([...sites, { url: "https://example.com/", verified: true }], "example.com"), "https://example.com/");
  assert.equal(pickBingSite(sites, "nothere.com"), null);
  // An unverified-only account has no usable site.
  assert.equal(pickBingSite([{ url: "https://www.example.com/", verified: false }], "example.com"), null);
  assert.deepEqual(bingSites({ response_data: { sites: [{ Url: "https://a.com/" }] } }), [{ url: "https://a.com/", verified: true }]);
});

test("a live post goes to the Bing site it lives under", () => {
  const sites = [
    { url: "https://www.example.com/", verified: true },
    { url: "https://www.example.com/blog/", verified: true },
    { url: "https://example.com/", verified: true },
    { url: "https://shop.example.com/", verified: true },
    { url: "https://other.com/", verified: false },
  ];
  assert.equal(bingSiteForUrl(sites, "https://www.example.com/blog/best-crm"), "https://www.example.com/blog/");
  assert.equal(bingSiteForUrl(sites, "https://www.example.com/news/x"), "https://www.example.com/");
  assert.equal(bingSiteForUrl(sites, "https://example.com/blog/x"), "https://example.com/");
  assert.equal(bingSiteForUrl(sites, "https://shop.example.com/p/1"), "https://shop.example.com/");
  assert.equal(bingSiteForUrl(sites, "https://other.com/x"), null);
  assert.equal(bingSiteForUrl(sites, "not a url"), null);
  assert.equal(bingSiteForUrl([{ url: "https://example.com/blog/", verified: true }], "https://example.com/blogger"), null);
});

test("Bing dates read in ISO and in the older /Date()/ form", () => {
  assert.equal(bingDay("2026-11-09T00:00:00"), "2026-11-09");
  assert.equal(bingDay("/Date(1762646400000-0800)/"), "2025-11-09");
  assert.equal(bingDay(""), null);
  assert.equal(bingDay("soon"), null);
});

test("Bing totals come by day, and weekly query rows near the period still count", () => {
  const r = periodRange(7, new Date("2026-11-15T12:00:00Z"));
  const daily = bingRows({
    rows: [
      { date: "2026-11-02T00:00:00", clicks: 5, impressions: 50 },
      { date: "2026-11-09T00:00:00", clicks: 3, impressions: 60 },
      { date: "2026-11-15T00:00:00", clicks: 1, impressions: 40 },
      { Date: "/Date(1762646400000)/", Clicks: 100, Impressions: 1000 },
    ],
  });
  const queries = bingRows({
    report: "top_queries",
    rows: [
      { date: "2026-11-03T00:00:00", query: "crm", clicks: 2, impressions: 20 },
      { date: "2026-11-10T00:00:00", query: "crm", clicks: 3, impressions: 30 },
      { date: "2026-10-01T00:00:00", query: "old", clicks: 50, impressions: 500 },
      { query: "undated", clicks: 1, impressions: 5 },
    ],
  });
  const s = bingSummary(daily, queries, r);
  assert.equal(s.current.clicks, 4);
  assert.equal(s.current.impressions, 100);
  assert.equal(s.current.ctr, 4);
  assert.equal(s.current.position, null);
  assert.equal(s.previous.clicks, 5);
  assert.equal(s.series.length, 7);
  assert.equal(s.series.find((d) => d.day === "2026-11-09")?.clicks, 3);
  assert.deepEqual(s.queries.map((q) => [q.key, q.clicks]), [["crm", 5], ["undated", 1]]);
  assert.equal(s.queries[0].ctr, 10);
});
