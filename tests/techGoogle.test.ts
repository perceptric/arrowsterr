import assert from "node:assert/strict";
import { test } from "node:test";
import { coverageGroups, dayStats, inspectLink, isIndexed, matchProperty, notIndexedValuable, otherCanonical, pageStats, passes, pickInspections, rate, readHistory, readInspection, readSitemaps, readVitals, showMetric } from "../src/lib/tech/google.ts";

test("Search Analytics rows become page and day stats", () => {
  const pages = pageStats([{ keys: ["https://acme.com/b"], clicks: 3, impressions: 90, position: 7.26 }, { keys: ["https://acme.com/a"], clicks: 40, impressions: 900, position: 3.1 }, { keys: [] }]);
  assert.deepEqual(pages.map((p) => p.page), ["https://acme.com/a", "https://acme.com/b"]);
  assert.equal(pages[1].position, 7.3);
  assert.deepEqual(dayStats([{ keys: ["2026-11-02"], clicks: 5 }, { keys: ["2026-11-01"], clicks: 4 }, { keys: ["bad"] }]).map((d) => d.day), ["2026-11-01", "2026-11-02"]);
});

test("a URL Inspection answer is read, with rich result errors counted", () => {
  const i = readInspection("https://acme.com/p", {
    inspectionResult: {
      indexStatusResult: { verdict: "NEUTRAL", coverageState: "Crawled - currently not indexed", robotsTxtState: "ALLOWED", googleCanonical: "https://acme.com/p/", userCanonical: "https://acme.com/p", lastCrawlTime: "2026-11-01T10:00:00Z" },
      mobileUsabilityResult: { verdict: "PASS" },
      richResultsResult: { detectedItems: [{ richResultType: "Product snippets", items: [{ issues: [{ severity: "ERROR" }, { severity: "WARNING" }] }] }] },
    },
  });
  assert.equal(isIndexed(i), false);
  assert.equal(notIndexedValuable(i), true);
  // A trailing slash isn't a different canonical.
  assert.equal(otherCanonical(i), false);
  assert.equal(otherCanonical({ ...i, googleCanonical: "https://acme.com/other" }), true);
  assert.deepEqual(i.rich, [{ type: "Product snippets", errors: 1, warnings: 1 }]);
  assert.equal(isIndexed({ verdict: "PASS", coverage: "Submitted and indexed" }), true);
  assert.equal(isIndexed({ verdict: "NEUTRAL", coverage: "Indexed, not submitted in sitemap" }), true);
  assert.deepEqual(coverageGroups([{ verdict: "PASS", coverage: "Submitted and indexed" }, i, i]).map((g) => [g.label, g.count]), [["Indexed", 1], ["Crawled - currently not indexed", 2]]);
  assert.match(inspectLink("sc-domain:acme.com", "https://acme.com/p"), /resource_id=sc-domain%3Aacme\.com&id=https%3A%2F%2Facme\.com%2Fp/);
});

test("inspections go to pages with clicks first, never twice in 3 days, within the day's budget", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const last = new Map([["https://acme.com/a", "2026-11-09T00:00:00Z"], ["https://acme.com/c", "2026-10-01T00:00:00Z"]]);
  const got = pickInspections(
    [
      { url: "https://acme.com/d", clicks: 0, cited: false, inSitemap: false },
      { url: "https://acme.com/a", clicks: 90, cited: false, inSitemap: true },
      { url: "https://acme.com/b", clicks: 5, cited: false, inSitemap: true },
      { url: "https://acme.com/c", clicks: 0, cited: true, inSitemap: false },
      { url: "https://acme.com/e", clicks: 0, cited: false, inSitemap: true },
      { url: "https://acme.com/b", clicks: 5, cited: false, inSitemap: true },
    ],
    last,
    4,
    now,
  );
  assert.deepEqual(got, ["https://acme.com/b", "https://acme.com/c", "https://acme.com/e", "https://acme.com/d"]);
  assert.deepEqual(pickInspections([{ url: "x", clicks: 1, cited: false, inSitemap: false }], new Map(), 0, now), []);
});

test("the brand's Search Console property is the domain property, else the best URL-prefix one", () => {
  const sites = [{ siteUrl: "http://acme.com/", permissionLevel: "siteOwner" }, { siteUrl: "https://www.acme.com/", permissionLevel: "siteFullUser" }, { siteUrl: "https://other.com/" }];
  assert.equal(matchProperty(sites, "acme.com"), "https://www.acme.com/");
  assert.equal(matchProperty([...sites, { siteUrl: "sc-domain:acme.com", permissionLevel: "siteOwner" }], "https://www.acme.com/"), "sc-domain:acme.com");
  assert.equal(matchProperty([{ siteUrl: "sc-domain:acme.com", permissionLevel: "siteUnverifiedUser" }], "acme.com"), null);
});

test("sitemaps from the API sum their submitted and indexed counts", () => {
  const s = readSitemaps({ sitemap: [{ path: "https://acme.com/sitemap.xml", errors: "2", warnings: 0, isSitemapsIndex: true, contents: [{ submitted: "120", indexed: "80" }, { submitted: 10, indexed: 0 }] }] });
  assert.deepEqual(s[0], { path: "https://acme.com/sitemap.xml", lastDownloaded: null, lastSubmitted: null, pending: false, isIndex: true, errors: 2, warnings: 0, submitted: 130, indexed: 80 });
});

test("CrUX records give p75s and shares, and the Core Web Vitals verdict", () => {
  const v = readVitals({
    record: {
      metrics: {
        largest_contentful_paint: { histogram: [{ density: 0.641 }, { density: 0.24 }, { density: 0.119 }], percentiles: { p75: 3100 } },
        interaction_to_next_paint: { histogram: [{ density: 0.8 }, { density: 0.15 }, { density: 0.05 }], percentiles: { p75: 180 } },
        cumulative_layout_shift: { histogram: [{ density: 0.92 }, { density: 0.06 }, { density: 0.02 }], percentiles: { p75: "0.04" } },
      },
    },
  });
  assert.deepEqual(v.lcp, { p75: 3100, good: 64.1, ni: 24, poor: 11.9 });
  assert.equal(v.cls?.p75, 0.04);
  assert.equal(passes(v), false);
  assert.equal(passes({ ...v, lcp: { p75: 2100, good: 80, ni: 15, poor: 5 } }), true);
  assert.equal(passes({}), null);
  assert.equal(rate("inp", 201), "ni");
  assert.equal(rate("cls", 0.3), "poor");
  assert.equal(showMetric("lcp", 3100), "3.1 s");
  assert.equal(showMetric("inp", 180), "180 ms");
});

test("CrUX History lines up each period's p75 with its end date, gaps kept as null", () => {
  const h = readHistory({ record: { metrics: { largest_contentful_paint: { percentilesTimeseries: { p75s: [2600, null, 2900] } } }, collectionPeriods: [{ lastDate: { year: 2026, month: 5, day: 3 } }, { lastDate: { year: 2026, month: 5, day: 10 } }, { lastDate: { year: 2026, month: 5, day: 17 } }] } });
  assert.deepEqual(h.lcp, [{ end: "2026-05-03", value: 2600 }, { end: "2026-05-10", value: null }, { end: "2026-05-17", value: 2900 }]);
});
