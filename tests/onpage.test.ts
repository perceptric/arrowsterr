import assert from "node:assert/strict";
import { test } from "node:test";
import { areaScores, audit, mainKeywords, stem, checksFor, cleanSuggest, fixGain, keywordShare, MIN_COMPARE, scoreOf, termCounts, topTerms, baseline, type PageRead } from "../src/lib/onpage.ts";
import { readOnpage } from "../src/lib/onpageRead.ts";

const para = (s: string) => `<p>${s}</p>`;
const filler = (topic: string, n: number) => Array.from({ length: n }, (_, i) => para(`Teams that compare ${topic} look at pricing, setup time and support before they choose. Section ${i} explains what matters most for small teams.`)).join("");

function html(o: { title?: string; desc?: string; h1?: string; body?: string; schema?: string; extra?: string }) {
  return `<html><head>${o.title !== undefined ? `<title>${o.title}</title>` : ""}${o.desc ? `<meta name="description" content="${o.desc}">` : ""}${o.schema ? `<script type="application/ld+json">${o.schema}</script>` : ""}</head>
  <body><nav><a href="/pricing">Pricing</a><a href="/blog">Blog</a></nav><main>${o.h1 ? `<h1>${o.h1}</h1>` : ""}${o.body ?? ""}</main>${o.extra ?? ""}<footer><a href="https://twitter.com/x">X</a></footer></body></html>`;
}

const crmPage = (url: string, extra = "") =>
  readOnpage(
    html({
      title: "Best CRM for Startups in 2026: 9 Picks Compared",
      desc: "We compared the best CRM for startups on pricing, setup and pipeline tools, so you can pick one in an afternoon and start selling this week.",
      h1: "Best CRM for startups",
      body:
        para("The best CRM for startups is the one your team will use every day. We tested nine tools on pricing, pipeline views and email sync to help you choose fast.") +
        "<h2>How we picked</h2><h2>Pricing compared</h2><h2>Pipeline tools</h2><ul><li>Pipeline</li><li>Email sync</li></ul><table><tr><td>Plan</td></tr></table>" +
        filler("crm pipeline email sync pricing", 30) +
        extra,
      schema: '{"@type":"Article","dateModified":"2026-10-01","author":{"@type":"Person","name":"Ana"}}',
    }),
    url,
  );

test("the reader counts links in the writing only, and alt text on real images", () => {
  const p = readOnpage(
    html({ title: "T", h1: "Main heading", body: `<a href="/a">a</a><a href="https://acme.com/b">b</a><a href="#top">top</a><a href="https://g2.com/x">g2</a><img src="/a.png" alt="A chart"><img src="/b.png"><img src="data:x" >`, extra: '<link rel="canonical" href="https://acme.com/page">' }),
    "https://www.acme.com/page",
  );
  assert.equal(p.internalLinks, 2);
  assert.equal(p.externalLinks, 1);
  assert.equal(p.images, 2);
  assert.equal(p.noAlt, 1);
  assert.equal(p.h1Text, "Main heading");
  assert.equal(p.path, "/page");
  assert.equal(p.noindex, false);
});

test("keyword matching ignores stopwords, plurals and dashes", () => {
  assert.equal(keywordShare("best crm for startups", "Best CRMs for a Startup"), 1);
  assert.equal(keywordShare("best crm for startups", "/best-crm-startups/"), 1);
  assert.equal(keywordShare("best crm for startups", "CRM pricing"), 0.5);
  assert.equal(keywordShare("the", "anything"), 1);
});

test("terms most top pages share, without the keyword's own words or a phrase's parts", () => {
  const tops = ["pipeline stages and email sync matter", "email sync, pipeline stages, contact import", "pipeline stages with email sync", "contact import and email sync"];
  const terms = topTerms("crm", "We cover email sync only.", tops);
  const names = terms.map((t) => t.term);
  assert.ok(names.includes("email sync"));
  assert.ok(names.includes("pipeline stages"));
  assert.ok(!names.includes("email"), "a word inside a picked phrase is not listed again");
  assert.equal(terms.find((t) => t.term === "email sync")?.page, 1);
  assert.equal(terms.find((t) => t.term === "pipeline stages")?.page, 0);
  assert.deepEqual(topTerms("crm", "x", tops.slice(0, MIN_COMPARE - 1)), []);
  assert.equal(termCounts("CRM tools, CRM tools").get("crm tools"), 2);
});

const serpOf = (pages: (PageRead | null)[]) => pages.map((p, i) => ({ rank: i + 1, url: p?.url ?? `https://site${i}.com/x`, domain: `site${i}.com`, title: `Result ${i}`, read: p }));

test("a top 10 where 3 pages fail to load is scored on the 7 that loaded", () => {
  const page = crmPage("https://acme.com/best-crm");
  const tops = Array.from({ length: 7 }, (_, i) => crmPage(`https://rival${i}.com/best-crm`));
  const r = audit("best crm for startups", page, serpOf([...tops, null, null, null]), null);
  assert.equal(r.read, 7);
  assert.equal(r.top.filter((t) => !t.read).length, 3);
  assert.notEqual(r.topScore, null);
  assert.ok(r.checks.find((c) => c.id === "length")!.status !== "unknown");
});

test("with fewer than 3 readable top pages, comparison checks are skipped and there is no top average", () => {
  const page = crmPage("https://acme.com/best-crm");
  const r = audit("best crm for startups", page, serpOf([crmPage("https://r1.com/x"), crmPage("https://r2.com/x"), null, null, null]), null);
  assert.equal(r.topScore, null);
  assert.equal(r.checks.find((c) => c.id === "length")!.status, "unknown");
  assert.equal(r.checks.find((c) => c.id === "terms")!.status, "unknown");
  // Unknown checks don't pull the score down: the same page scores the same content-free areas either way.
  assert.ok(r.score > 0);
});

test("the page is never compared with itself when it ranks in the top 10", () => {
  const page = crmPage("https://acme.com/best-crm");
  const self = crmPage("https://www.acme.com/best-crm/");
  const rivals = [crmPage("https://r1.com/x"), crmPage("https://r2.com/x"), crmPage("https://r3.com/x")];
  const r = audit("best crm for startups", page, serpOf([self, ...rivals]), null);
  assert.equal(r.rank, 1);
  assert.equal(r.read, 3);
});

test("a thin page without schema or keyword in the title scores below a full one, with fixes named", () => {
  const good = crmPage("https://acme.com/best-crm");
  const thin = readOnpage(html({ title: "Home", h1: "Welcome", body: para("We sell software for teams of every size and shape across the world.") }), "https://acme.com/");
  const tops = [crmPage("https://r1.com/x"), crmPage("https://r2.com/x"), crmPage("https://r3.com/x"), crmPage("https://r4.com/x")];
  const g = audit("best crm for startups", good, serpOf(tops), null);
  const t = audit("best crm for startups", thin, serpOf(tops), null);
  assert.ok(t.score < g.score - 20, `${t.score} vs ${g.score}`);
  const byId = Object.fromEntries(t.checks.map((c) => [c.id, c]));
  assert.equal(byId.kw_title.status, "fail");
  assert.equal(byId.kw_title.fix, "meta");
  assert.equal(byId.schema.status, "fail");
  assert.equal(byId.length.status, "fail");
  assert.ok(fixGain(t, "meta") > 0);
  assert.ok(fixGain(t, "schema") > 0);
});

test("noindex fails the page however good the rest is", () => {
  const p = crmPage("https://acme.com/best-crm");
  const no = { ...p, noindex: true };
  const b = baseline("best crm for startups", no, []);
  assert.equal(checksFor("best crm for startups", no, b, null).find((c) => c.id === "indexable")!.status, "fail");
});

test("area scores skip areas with nothing checked", () => {
  const areas = areaScores([{ id: "x", area: "keyword", label: "", status: "pass", detail: "", fix: null, weight: 1 }]);
  assert.equal(areas.keyword, 100);
  assert.equal(areas.content, null);
  assert.equal(scoreOf(areas), 100);
});

test("suggestions that break the length rules or drop the keyword are thrown away", () => {
  const ok = cleanSuggest("best crm for startups", { title: "Best CRM for Startups: 9 Tools Compared for 2026", description: "We compared the best CRM for startups on price, setup time and pipeline tools, so you can pick one in an afternoon.", answer: "The best CRM for startups is the one your team opens every day. For most small teams that means simple pipelines, email sync and a free plan." });
  assert.ok(ok?.title);
  assert.ok(ok?.answer);
  assert.equal(cleanSuggest("best crm for startups", { title: "Short", description: "x".repeat(130) }), null);
  assert.equal(cleanSuggest("best crm for startups", { title: "A Great Guide to Selling Software in a Big Way", description: "y ".repeat(60) }), null);
  assert.equal(cleanSuggest("best crm", null), null);
});

test("each page's main keyword is the one that brings the most visits, and visits add up per page", () => {
  const rows = mainKeywords([
    { keyword: "crm", url: "https://acme.com/crm/", rank: 8, etv: 40, volume: 9000 },
    { keyword: "best crm for startups", url: "https://www.acme.com/crm", rank: 3, etv: 120, volume: 900 },
    { keyword: "acme pricing", url: "https://acme.com/pricing", rank: 1, etv: 300, volume: 500 },
    { keyword: "no page", url: null, rank: 1, etv: 999, volume: 1 },
  ]);
  assert.deepEqual(rows.map((r) => [r.url, r.keyword, r.traffic]), [["https://acme.com/pricing", "acme pricing", 300], ["https://acme.com/crm/", "best crm for startups", 160]]);
  assert.equal(rows[1].rank, 3);
});

test("plurals count as one term, generic words are skipped, and phrases come before single words", () => {
  const tops = [
    "Pipelines help a business. Our pipeline view and lead scoring keep companies on track with forecasting.",
    "A pipeline for every company, with lead scoring and forecasting for your business.",
    "Lead scoring and pipelines, plus forecasting reports for businesses.",
  ];
  const terms = topTerms("crm", "We explain the pipeline.", tops);
  const names = terms.map((t) => t.term);
  assert.equal(names.filter((n) => /^pipelines?$/.test(n)).length, 1, "pipeline and pipelines are one term");
  assert.equal(terms.find((t) => /^pipelines?$/.test(t.term))?.page, 1);
  assert.ok(!names.some((n) => /^(business|businesses|company|companies)$/.test(n)), "generic words are left out");
  assert.equal(names[0], "lead scoring");
});

test("the stem matches plurals without cutting real words", () => {
  assert.equal(stem("pipelines"), "pipeline");
  assert.equal(stem("features"), "feature");
  assert.equal(stem("boxes"), "box");
  assert.equal(stem("companies"), "company");
  assert.equal(stem("business"), "business");
  assert.equal(stem("analysis"), "analysis");
  assert.equal(stem("crm"), "crm");
  assert.equal(stem("pricing"), "pricing");
});
