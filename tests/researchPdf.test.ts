import assert from "node:assert/strict";
import { test } from "node:test";
import { splitShared, type Gap, type GapRow } from "../src/lib/gap.ts";
import type { BrandStat } from "../src/lib/metrics.ts";
import { fileLine } from "../src/lib/pdf/pages.ts";
import { cleanResearch, domainBulkPdf, domainPdf, gapPdf, keywordBulkPdf, keywordPdf, researchTitle, trendChange } from "../src/lib/pdf/research.ts";
import { pagesOf, type DomainReport, type KeywordReport, type KwSummary } from "../src/lib/research.ts";

const kw = (keyword: string, volume: number | null, kd: number | null = 20, trend: number[] = []): KwSummary => ({
  keyword,
  volume,
  kd,
  cpc: 1.5,
  competition: 0.4,
  intent: "commercial",
  otherIntents: [],
  trend: trend.map((v, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, volume: v })),
  serp: [],
  results: 1000,
  core: null,
});

test("what a research page sends is cleaned: keyword, site, gap or a bulk run", () => {
  assert.deepEqual(cleanResearch("keywords", { keyword: "  Best   CRM ", country: "Germany", device: "mobile" }), { tool: "keyword", keyword: "best crm", country: "Germany", device: "mobile" });
  assert.deepEqual(cleanResearch("keywords", { keyword: "crm", country: "Atlantis" }), { tool: "keyword", keyword: "crm", country: "United States", device: "desktop" });
  assert.deepEqual(cleanResearch("keywords", { bulk: "k7f2a9x1" }), { tool: "keyword-bulk", bulk: "k7f2a9x1" });
  assert.equal(cleanResearch("keywords", { bulk: "../etc" }), null);
  assert.equal(cleanResearch("keywords", {}), null);
  assert.deepEqual(cleanResearch("domain", { domain: "acme.com/blog", scope: "subfolder" }), { tool: "domain", domain: "acme.com/blog", scope: "subfolder", country: "United States" });
  assert.deepEqual(cleanResearch("domain", { domain: "acme.com", scope: "nope" }), { tool: "domain", domain: "acme.com", scope: "domain", country: "United States" });
  assert.deepEqual(cleanResearch("domain", { bulk: "abc123" }), { tool: "domain-bulk", bulk: "abc123" });
  assert.deepEqual(cleanResearch("gap", { siteId: "s1", competitor: "Rival.com", days: 9999 }), { tool: "gap", siteId: "s1", competitor: "rival.com", days: 365 });
  assert.equal(cleanResearch("gap", { competitor: "rival.com" }), null);
});

test("keyword report: the page's tiles, the top 20 ideas and Google's top 10", () => {
  const variations = Array.from({ length: 25 }, (_, i) => kw(`crm ${i}`, 1000 - i));
  const r: KeywordReport = {
    keyword: "crm",
    country: "United States",
    device: "desktop",
    overview: { ...kw("crm", 50000, 72, [100, 120, 90, 150]), source: "ads" },
    byCountry: [],
    variations: { total: 4200, volume: 0, rows: variations },
    questions: { total: 3, volume: 0, rows: [kw("what is crm", 900)] },
    clusters: [{ name: "crm software", volume: 5000, count: 12, keywords: Array.from({ length: 12 }, (_, i) => `k${i}`) }],
    serp: {
      features: ["ai_overview"],
      ads: 0,
      results: 100,
      aio: { shown: true, cites: [{ domain: "g2.com", url: "https://g2.com/crm", title: "Best CRM" }] },
      local: [],
      rows: Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, url: `https://site${i}.com/`, domain: `site${i}.com`, title: `Site ${i}`, sitelinks: false, traffic: 100 * i, keywords: i, aiCited: i === 0 })),
    },
    cost: 0,
    cached: true,
  };
  const d = keywordPdf(r);
  assert.deepEqual(d.tiles, { volume: 50000, source: "ads", kd: 72, kdWord: "Hard", intent: "commercial", cpc: 1.5, trendChange: 50 });
  assert.equal(d.variations.rows.length, 20);
  assert.equal(d.variations.total, 4200);
  assert.equal(d.serp!.rows.length, 10);
  assert.equal(d.clusters[0].keywords.length, 8);
  assert.equal(researchTitle(d), "Keyword Report: crm");
  assert.equal(keywordPdf({ ...r, overview: null, serp: null }).tiles, null);
});

test("trend change matches the Keyword Research page", () => {
  assert.equal(trendChange([{ volume: 200 }, { volume: 150 }]), -25);
  assert.equal(trendChange([{ volume: 0 }, { volume: 150 }]), null, "no change from zero");
  assert.equal(trendChange([{ volume: 10 }]), null);
});

test("bulk keywords: totals over every row, biggest first", () => {
  const d = keywordBulkPdf([kw("a", 10, 10), kw("b", null, null), kw("c", 300, 30)], "Canada");
  assert.deepEqual(d.tiles, { keywords: 3, found: 2, volume: 310, avgKd: 20 });
  assert.deepEqual(d.rows.map((r) => r.keyword), ["c", "a", "b"]);
  assert.equal(researchTitle(d), "Keyword Report: 3 keywords");
});

test("domain report: top 50 keywords by visits, top 20 pages, top 10 competitors", () => {
  const keywords = Array.from({ length: 80 }, (_, i) => ({ ...kw(`k${i}`, 100), trend: [], serp: [], rank: 3, url: `https://acme.com/p${i % 30}`, etv: i }));
  const r: DomainReport = {
    domain: "acme.com",
    scope: "domain",
    country: "United States",
    overview: { keywords: 900, traffic: 12000, top3: 40, top10: 120, top20: 200, top100: 900, newKw: 12, lostKw: 4 },
    keywords,
    pages: pagesOf(keywords),
    competitors: Array.from({ length: 15 }, (_, i) => ({ domain: `r${i}.com`, shared: 10, keywords: 100, traffic: 1000 })),
    cost: 0,
    cached: true,
  };
  const d = domainPdf(r);
  assert.equal(d.keywords.length, 50);
  assert.equal(d.keywords[0].keyword, "k79", "most visits first");
  assert.equal(d.pages.length, 20);
  assert.deepEqual(d.pages[0], pagesOf(keywords)[0], "the same pages the page shows");
  assert.equal(d.competitors.length, 10);
  assert.equal(researchTitle(d), "Domain Report: acme.com");
});

test("bulk sites: totals and most visits first", () => {
  const row = (target: string, traffic: number | null) => ({ target, kind: "domain" as const, keywords: 10, traffic, value: 5, paidKeywords: null, paidTraffic: null });
  const d = domainBulkPdf([row("a.com", 5), row("b.com", null), row("c.com", 50)], "United States");
  assert.deepEqual(d.tiles, { sites: 3, keywords: 30, traffic: 55, value: 15 });
  assert.deepEqual(d.rows.map((r) => r.target), ["c.com", "a.com", "b.com"]);
});

test("keyword gap: the page's counts, AI rivals with a site, and the three lists", () => {
  const g = (keyword: string, volume: number, them: number | null, you: number | null): GapRow => ({ keyword, volume, kd: 30, intent: null, them, you, url: null });
  const gap: Gap = {
    missing: Array.from({ length: 60 }, (_, i) => g(`m${i}`, i, 3, null)),
    shared: [g("s1", 500, 1, 5), g("s2", 400, 8, 2), g("s3", 300, 4, 4), g("s4", 900, 2, 9)],
    only: [g("o1", 10, null, 1)],
    totals: { missing: 1200, shared: 4, only: 77 },
  };
  const stats: BrandStat[] = [
    { name: "Acme", domain: "acme.com", isYou: true, visibility: 40, sentiment: 70, position: 2, mentions: 4 },
    { name: "Rival Co", domain: "www.rival.com", isYou: false, visibility: 60, sentiment: 70, position: 1, mentions: 6 },
    { name: "No Site", domain: null, isYou: false, visibility: 30, sentiment: 70, position: 3, mentions: 3 },
    { name: "Acme Again", domain: "acme.com", isYou: false, visibility: 10, sentiment: 70, position: 4, mentions: 1 },
  ];
  const d = gapPdf(gap, { name: "Acme", domain: "acme.com" }, "rival.com", stats, "United States");
  const split = splitShared(gap.shared);
  assert.deepEqual(d.counts, { missing: 1200, shared: 4, only: 77, weaker: split.weaker.length, lead: split.lead.length });
  assert.equal(d.them.name, "Rival Co", "the name AI answers use");
  assert.deepEqual(d.rivals.map((r) => r.domain), ["rival.com"], "brands with a site that isn't yours");
  assert.equal(d.opportunities.length, 50);
  assert.equal(d.opportunities[0].keyword, "m59", "biggest first");
  assert.deepEqual(d.theyLead.map((r) => r.keyword), ["s4", "s1"]);
  assert.deepEqual(d.youLead.map((r) => r.keyword), ["s2", "s3"], "a tie counts as yours, like the page");
  assert.equal(researchTitle(d), "Keyword Gap: Acme vs Rival Co");
  assert.equal(gapPdf(gap, { name: "Acme", domain: "acme.com" }, "the-hoth.com", [], "United States").them.name, "The Hoth");
});

test("each file's line in Reports", () => {
  assert.equal(fileLine("prompts", { days: 30, topic: "CRM" }), "Last 30 days · CRM");
  assert.equal(fileLine("keywords", { tool: "keyword", keyword: "crm", country: "Germany" }), "crm · Germany");
  assert.equal(fileLine("domain", { bulk: "abc" }), "Bulk analysis");
  assert.equal(fileLine("gap", { competitor: "rival.com" }), "vs rival.com");
});
