import { test } from "node:test";
import assert from "node:assert/strict";
import { compareResult, findOpportunities, linkSuggestions, NO_TOTALS, planSections, resultWindows, type PageAgg } from "../src/lib/seoAnalytics.ts";
import { addSections, applyEdits } from "../src/lib/draftEdits.ts";
import { pageOutline } from "../src/lib/pageText.ts";
import { outlineToDoc } from "../src/lib/writer.ts";

const page = (p: string, o: Partial<PageAgg> = {}): PageAgg => ({ page: p, clicks: 0, impressions: 0, position: null, sessions: 0, conversions: 0, ai_sessions: 0, ...o });

test("before and after windows: 28 days each, cut at the last day with data", () => {
  const full = resultWindows("2026-10-01T14:00:00Z", "2026-11-23");
  assert.deepEqual(full, { before: ["2026-09-03", "2026-09-30"], after: ["2026-10-01", "2026-10-28"], afterDays: 28, full: true });
  const young = resultWindows("2026-11-15T09:00:00Z", "2026-11-23");
  assert.deepEqual(young, { before: ["2026-10-18", "2026-11-14"], after: ["2026-11-15", "2026-11-23"], afterDays: 9, full: false });
  assert.equal(resultWindows("2026-11-25T09:00:00Z", "2026-11-23"), null, "no data since it went live yet");
  assert.equal(resultWindows("2026-11-23", "2026-11-23")?.afterDays, 1);
});

test("after is compared with the same number of days before", () => {
  const before = { clicks: 280, impressions: 14_000, position: 9.4, sessions: 560, conversions: 14, ai_sessions: 28 };
  const after = { clicks: 150, impressions: 6000, position: 6.1, sessions: 240, conversions: 3, ai_sessions: 30 };
  const r = compareResult(before, after, 28, 7);
  assert.equal(r.clicks.before, 70, "a quarter of the 28 days before");
  assert.equal(r.clicks.change, Math.round(((150 - 70) / 70) * 1000) / 1000);
  assert.equal(r.position.change, -3.3, "moved up 3.3 places");
  assert.equal(r.conversions.before, 4);
  const fresh = compareResult(NO_TOTALS, after, 28, 7);
  assert.equal(fresh.clicks.change, null, "a new page has nothing to compare with");
  assert.equal(fresh.position.change, null);
});

test("a refresh keeps sections that still rank and rewrites the ones that slipped", () => {
  const sections = [
    { heading: "How to calculate NPS", text: "Subtract the share of detractors from the share of promoters." },
    { heading: "NPS benchmarks for restaurants", text: "Most restaurants score between 30 and 50." },
    { heading: "About our company", text: "We started in 2019." },
  ];
  const now = [
    { query: "how to calculate nps", clicks: 1200, impressions: 9000, position: 2.1 },
    { query: "nps benchmark restaurants", clicks: 20, impressions: 2400, position: 13.5 },
    { query: "nps survey questions", clicks: 4, impressions: 900, position: 22 },
    { query: "net promoter score formula excel", clicks: 3, impressions: 700, position: 9.2 },
  ];
  const before = [{ query: "nps benchmark restaurants", clicks: 90, impressions: 2600, position: 7.9 }];
  const plan = planSections(sections, now, before);
  assert.equal(plan.sections[0].action, "keep");
  assert.deepEqual(plan.sections[0].queries, ["how to calculate nps"]);
  assert.equal(plan.sections[1].action, "rewrite", "slipped from 7.9 to 13.5");
  assert.equal(plan.sections[2].action, "keep");
  assert.equal(plan.sections[2].queries.length, 0, "no search lands there");
  assert.deepEqual(plan.add.map((q) => q.query), ["nps survey questions"], "a search nothing answers becomes a new section");
  assert.equal(plan.titleFix?.query, "net promoter score formula excel", "page 1 with a weak click rate");
});

test("new sections go before the FAQ, and a page outline becomes a draft edits can find", () => {
  const html = `<html><head><title>NPS guide</title><meta name="description" content="All about NPS."></head><body><nav>Menu Home About Pricing</nav><article><h1>NPS guide</h1><p>Net Promoter Score tells you how loyal guests are.</p><h2>How to calculate NPS</h2><p>Subtract the share of detractors from the share of promoters.</p><ul><li>Promoters score 9 or 10</li><li>Detractors score 0 to 6</li></ul><h2>Frequently asked questions</h2><h3>Is 40 good?</h3><p>Yes, 40 is a strong score for most restaurants.</p></article><footer>© 2026 Momos Inc all rights</footer></body></html>`;
  const o = pageOutline(html);
  assert.equal(o.title, "NPS guide");
  assert.equal(o.description, "All about NPS.");
  assert.deepEqual(o.sections.map((s) => s.heading), ["How to calculate NPS", "Frequently asked questions", "Is 40 good?"]);
  assert.deepEqual(o.sections[0].blocks.map((b) => b.type), ["p", "li", "li"]);
  const doc = outlineToDoc(o) as unknown as Record<string, unknown>;
  const edited = applyEdits(doc, [{ find: "Subtract the share of detractors from the share of promoters.", replace: "NPS = % promoters − % detractors." }]);
  assert.deepEqual(edited.applied, [0]);
  const withNew = addSections(edited.doc, [{ h2: "NPS survey questions", paragraphs: ["Ask one question first.", ""] }]) as { content: { type: string; content?: { text?: string }[] }[] };
  const heads = withNew.content.filter((n) => n.type === "heading").map((n) => n.content?.[0]?.text);
  assert.deepEqual(heads, ["NPS guide", "How to calculate NPS", "NPS survey questions", "Frequently asked questions", "Is 40 good?"]);
  assert.equal(withNew.content.filter((n) => n.type === "paragraph" && n.content?.[0]?.text === "Ask one question first.").length, 1, "empty paragraphs are left out");
});

test("pages at 5 to 15 get links from busier pages on the same topic", () => {
  const pages = [
    page("/blog/restaurant-guest-feedback", { clicks: 250, impressions: 18_900, position: 8.4, sessions: 400 }),
    page("/blog/how-to-calculate-nps", { clicks: 1240, impressions: 31_000, position: 3.2, sessions: 2310 }),
    page("/guest-feedback", { clicks: 455, impressions: 9000, position: 4, sessions: 1210 }),
    page("/blog/payroll-tips", { clicks: 900, impressions: 12_000, position: 3, sessions: 1500 }),
    page("/", { clicks: 5000, impressions: 40_000, position: 1.5, sessions: 9000 }),
  ];
  const queryPages = [
    { query: "restaurant guest feedback", page: "/blog/restaurant-guest-feedback", clicks: 200, impressions: 15_000, position: 8.4 },
    { query: "guest feedback software", page: "/guest-feedback", clicks: 300, impressions: 6000, position: 4 },
    { query: "restaurant nps", page: "/blog/how-to-calculate-nps", clicks: 100, impressions: 3000, position: 5 },
    { query: "payroll tips small business", page: "/blog/payroll-tips", clicks: 900, impressions: 12_000, position: 3 },
  ];
  const s = linkSuggestions({ pages, queryPages });
  assert.equal(s.length, 1);
  assert.equal(s[0].page, "/blog/restaurant-guest-feedback");
  assert.equal(s[0].anchor, "restaurant guest feedback", "the link's words are the target's top search");
  assert.ok(s[0].sources.some((x) => x.page === "/guest-feedback"));
  assert.ok(!s[0].sources.some((x) => x.page === "/blog/payroll-tips"), "an unrelated page is not a source");
  assert.ok(!s[0].sources.some((x) => x.page === "/"), "the home page is left out");
  const opps = findOpportunities({ days: 28, queries: [], pages, pagesPrev: [], queryPages });
  const links = opps.find((o) => o.kind === "links");
  assert.ok(links && links.gain_clicks > 0);
  assert.deepEqual(links!.data.sources, s[0].sources.map((x) => x.page));
});
