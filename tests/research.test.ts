import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBySerp, pick, slots, type AgentKeyword } from "../src/lib/research.ts";

const kw = (keyword: string, volume: number | null, theme = "A"): AgentKeyword => ({
  keyword, volume, kd: 20, cpc: null, intent: null, trend: [], serp: [], stage: "bofu", theme, group: -1,
});

test("keywords sharing 3 or more top results become one page, led by the biggest", () => {
  const list = [kw("best crm", 100), kw("top crm software", 500), kw("crm pricing", 50)];
  const serps = new Map([
    ["best crm", ["a.com/1", "b.com/2", "c.com/3", "d.com/4"]],
    ["top crm software", ["a.com/1", "b.com/2", "c.com/3", "x.com"]],
    ["crm pricing", ["a.com/1", "y.com", "z.com"]],
  ]);
  const groups = groupBySerp(list, serps);
  assert.equal(groups.length, 2);
  const big = groups.find((g) => g.keywords.length === 2)!;
  assert.equal(big.primary, "top crm software");
  assert.equal(big.volume, 600);
  assert.equal(list[0].group, list[1].group);
  assert.notEqual(list[0].group, list[2].group);
});

test("pick takes turns across themes", () => {
  const list = [kw("a1", 900, "A"), kw("a2", 800, "A"), kw("a3", 700, "A"), kw("b1", 10, "B")];
  assert.deepEqual(pick(list, 2, ["A", "B"]).map((k) => k.keyword), ["a1", "b1"]);
});

test("slots puts 2 posts a week on Monday and Wednesday, never before the start", () => {
  // 2026-10-07 is a Wednesday.
  assert.deepEqual(slots(new Date(2026, 9, 7), 2, 4), ["2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19"]);
});

test("cleanUrl keeps real pages and drops junk", async () => {
  const { cleanUrl } = await import("../src/lib/urls.ts");
  assert.equal(cleanUrl("https://www.acme.com/blog/how-to-pick-a-crm/?utm=x#top", "acme.com"), "https://www.acme.com/blog/how-to-pick-a-crm");
  assert.equal(cleanUrl("https://acme.com/tag/crm/", "acme.com"), null);
  assert.equal(cleanUrl("https://acme.com/wp-content/uploads/a.png", "acme.com"), null);
  assert.equal(cleanUrl("https://other.com/page", "acme.com"), null);
  assert.equal(cleanUrl("https://blog.acme.com/post-one", "acme.com"), "https://blog.acme.com/post-one");
});

test("keyword clusters group by core keyword", async () => {
  const { clustersOf } = await import("../src/lib/research.ts");
  const k = (keyword: string, core: string | null, volume: number) => ({ keyword, core, volume, kd: null, cpc: null, competition: null, intent: null, otherIntents: [], trend: [], serp: [], results: null });
  const c = clustersOf([k("best seo agency", "seo agency", 100), k("top seo agency", "seo agency", 50), k("seo services", "seo services", 10), k("best seo agencies", "best seo agencies", 5)], "best seo agencies");
  assert.equal(c[0].name, "seo agency");
  assert.equal(c[0].count, 2);
  assert.equal(c[0].volume, 150);
  assert.ok(!c.some((x) => x.name === "best seo agencies"));
});

test("writer: brief to draft, markdown, coverage", async () => {
  const { briefToDoc, briefGuides, guideKey, mdToHtml, coverage } = await import("../src/lib/writer.ts");
  const brief = {
    serp: { pages: [], questions: [], related: [], features: [], aiOverview: { shown: false, text: "", cites: [] } },
    analysis: { intent: "Compare agencies", format: "listicle", formatWhy: "", wordRange: "", mustCover: ["pricing models for agencies"], gaps: [], aiOverview: "", actions: [], pages: [] },
    brief: { titles: ["Best SEO agencies"], metaDescription: "m", slug: "/x", h1: "Best SEO agencies in 2026", wordCount: "2,000", outline: [{ h2: "How we picked", h3: ["Pricing"], notes: "Explain the method" }], questions: ["How much does an SEO agency cost?"], terms: ["retainer"], internalLinks: [{ url: "https://acme.com/seo", anchor: "our SEO service" }], sources: [], makeItYours: ["Add your own test"], aiTips: [] },
    at: "", cost: 0,
  };
  const doc = briefToDoc("best seo agencies", [], brief);
  const types = doc.content!.map((n) => `${n.type}${n.attrs?.level ?? ""}`);
  assert.ok(types.includes("heading1") && types.includes("heading2") && types.includes("heading3") && !types.includes("note"));
  const guides = briefGuides("best seo agencies", [], brief);
  assert.equal(guides.get(guideKey("How we picked"))?.text, "Explain the method");
  assert.ok(guides.get(guideKey("Best SEO agencies in 2026"))?.text.includes("best seo agencies"));
  assert.equal(mdToHtml("## Hi\n- a **b**\n\n```html\n<b>x</b>\n```"), '<h3>Hi</h3><ul><li>a <strong>b</strong></li></ul><pre data-lang="html"><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
  const c = coverage("Agency pricing models vary. A retainer is common. How much does an SEO agency cost? About...", '<a href="https://acme.com/seo">x</a>', brief);
  assert.equal(c.score, 100);
});

test("reports: wins, drops and content rows", async () => {
  const { winsAndDrops, contentRows } = await import("../src/lib/reports.ts");
  const traffic = { totals: { visitors: 0, visits: 0, pageviews: 0 }, totalsPrev: { visitors: 0, visits: 0, pageviews: 0 }, ai: 10, aiPrev: 2, byEngine: [{ engine: "ChatGPT", visits: 10, prev: 2 }], pages: [{ path: "/blog/a/", visits: 4 }], breakdowns: { pages: [{ x: "/blog/a", y: 120 }] } };
  const wd = winsAndDrops({ engines: [{ engine: "Gemini", now: 20, before: 35 }], traffic });
  assert.equal(wd.wins[0].text, "Visits from ChatGPT");
  assert.equal(wd.drops[0].text, "Visibility on Gemini");
  const rows = contentRows({
    items: [{ id: "1", keyword: "crm for dentists", url: "https://acme.com/blog/a/", current_url: null, due_date: "2026-10-01", action: "new", status: "published" }, { id: "2", keyword: "x", url: null, current_url: null, due_date: null, action: "new", status: "planned" }],
    citedPaths: new Map([["/blog/a", 25]]), traffic,
  });
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].cited, rows[0].visits, rows[0].aiVisits], [25, 120, 4]);
});
