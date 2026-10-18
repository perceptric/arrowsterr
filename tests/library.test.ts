import { test } from "node:test";
import assert from "node:assert/strict";
import { briefDocHtml, BRIEF_SECTIONS, htmlToText } from "../src/lib/briefDoc.ts";
import type { Brief, Serp } from "../src/lib/briefTypes.ts";
import { briefState, cleanDraftHtml, draftState, insights, pageType, recommendations, statusAfter, workflowStep } from "../src/lib/library.ts";

const piece = (p: Partial<Parameters<typeof insights>[0]> = {}): Parameters<typeof insights>[0] => ({
  keyword: "semrush alternatives",
  status: "planned",
  brief_status: null,
  stage: "bofu",
  intent: "commercial",
  difficulty: 62,
  secondary: ["semrush competitors"],
  action: "new",
  current_rank: null,
  ...p,
});

const serp: Serp = {
  pages: [
    { rank: 1, url: "https://www.ahrefs.com/a", domain: "www.ahrefs.com", title: "A", description: "", read: true, words: 2100, headings: [], schema: [], tables: 1, images: 0, videos: 0, lists: 0, updated: null },
    { rank: 2, url: "https://moz.com/b", domain: "moz.com", title: "B", description: "", read: true, words: 1900, headings: [], schema: [], tables: 0, images: 0, videos: 0, lists: 0, updated: null },
    { rank: 3, url: "https://g2.com/c", domain: "g2.com", title: "C", description: "", read: true, words: 2000, headings: [], schema: [], tables: 0, images: 0, videos: 0, lists: 0, updated: null },
    { rank: 4, url: "https://x.com/d", domain: "x.com", title: "D", description: "", read: false, words: 0, headings: [], schema: [], tables: 0, images: 0, videos: 0, lists: 0, updated: null },
  ],
  questions: ["Is there a free Semrush alternative?"],
  related: ["semrush vs ahrefs", "semrush competitors"],
  features: ["featured_snippet", "people_also_ask"],
  aiOverview: { shown: true, text: "", cites: [] },
};

const brief: Brief = {
  serp,
  analysis: { intent: "Compare tools", format: "Listicle comparison", formatWhy: "Top pages list tools", wordRange: "1800-2200", mustCover: ["pricing"], gaps: ["No one shows real pricing", "Few cover AI search"], aiOverview: "", actions: ["Rank for semrush alternatives"], pages: [] },
  brief: { titles: ["7 Semrush Alternatives"], metaDescription: "Compare", slug: "/semrush-alternatives", h1: "7 Semrush Alternatives", wordCount: "2000", outline: [{ h2: "Why switch", h3: [], notes: "" }], questions: [], terms: [], internalLinks: [], sources: [], makeItYours: [], aiTips: ["Quote prices in a table."] },
  at: "2026-10-01T00:00:00Z",
  cost: 0,
};

test("the workflow follows real records: a draft moves past Brief, Review needs a draft, Published wins", () => {
  assert.equal(workflowStep({ status: "planned", brief_status: null }, false), "planned");
  assert.equal(workflowStep({ status: "planned", brief_status: "done" }, false), "brief");
  // A status set by hand never skips a missing document.
  assert.equal(workflowStep({ status: "writing", brief_status: null }, false), "planned");
  assert.equal(workflowStep({ status: "review", brief_status: "done" }, false), "brief");
  assert.equal(workflowStep({ status: "brief", brief_status: "done" }, true), "draft");
  assert.equal(workflowStep({ status: "review", brief_status: "done" }, true), "review");
  assert.equal(workflowStep({ status: "published", brief_status: null }, false), "published");
});

test("work moving on never moves a piece's status back", () => {
  assert.equal(statusAfter("planned", "brief"), "brief");
  assert.equal(statusAfter("planned", "draft"), "writing");
  assert.equal(statusAfter("brief", "draft"), "writing");
  assert.equal(statusAfter("writing", "brief"), "writing");
  assert.equal(statusAfter("review", "draft"), "review");
  assert.equal(statusAfter("published", "draft"), "published");
});

test("Library states for a brief and a draft", () => {
  assert.equal(briefState({ brief_status: null }).label, "Not generated");
  assert.equal(briefState({ brief_status: "running" }).label, "Generating");
  assert.equal(briefState({ brief_status: "done" }).label, "Ready to edit");
  assert.equal(draftState({ status: "brief" }, null).label, "Not generated");
  assert.equal(draftState({ status: "writing" }, { words: 0 }).label, "Empty");
  assert.equal(draftState({ status: "writing" }, { words: 900 }).label, "Draft");
  assert.equal(draftState({ status: "review" }, { words: 900 }).label, "In review");
});

test("insights use only saved data and skip what is missing", () => {
  const bare = insights(piece({ intent: null, stage: null, difficulty: null, secondary: [] }), null, null);
  assert.deepEqual(bare.map((x) => x.id), ["type"]);
  const full = insights(piece(), serp, brief);
  assert.deepEqual(full.map((x) => x.id), ["intent", "serp", "type", "gap", "related"]);
  assert.match(full[1].text, /High competition, top sites: ahrefs\.com, moz\.com, g2\.com/);
  assert.equal(full[2].text, "Listicle comparison");
  assert.equal(full[4].text, "semrush competitors, semrush vs ahrefs");
});

test("page type falls back to rules from the keyword", () => {
  assert.equal(pageType("semrush vs ahrefs", "bofu", null), "Comparison");
  assert.equal(pageType("best seo tools", "mofu", null), "Listicle");
  assert.equal(pageType("how to do keyword research", "tofu", null), "How-to guide");
  assert.equal(pageType("seo api", "bofu", null), "Product or landing page");
});

test("recommendations come from the SERP and brief, at most 6, no repeats", () => {
  const r = recommendations(piece(), serp, brief);
  assert.ok(r.length <= 6);
  assert.equal(new Set(r).size, r.length);
  assert.ok(r.includes("Aim for about 2,000 words, like the top pages."));
  assert.ok(r.includes("Add a comparison table."));
  assert.ok(r.some((x) => x.startsWith("Add an FAQ. Start with: Is there a free")));
  // Unread pages don't skew the length.
  const few = recommendations(piece(), { ...serp, pages: serp.pages.slice(2) }, null);
  assert.ok(!few.some((x) => x.startsWith("Aim for")));
  const update = recommendations(piece({ action: "update", current_rank: 14 }), null, null);
  assert.equal(update[0], "Update the page that ranks #14 instead of starting a new one.");
});

test("the brief document has the seven sections in order", () => {
  const html = briefDocHtml({ keyword: "semrush alternatives", secondary: [], action: "new", current_url: null }, brief, { name: "Arrowsterr" }, null);
  const heads = [...html.matchAll(/<h2>(\d)\. ([^<]+)<\/h2>/g)].map((m) => m[2]);
  assert.deepEqual(heads, [...BRIEF_SECTIONS]);
});

test("the edited brief reaches the prompt as text with its shape", () => {
  const t = htmlToText('<h2>6. Article Outline</h2><table><tr><td><p><strong>H2: Pricing</strong></p></td><td><p>Show &amp; compare</p></td></tr></table><ul><li><p>Use <a href="https://a.com">our page</a></p></li></ul><script>alert(1)</script>');
  assert.equal(t, "## 6. Article Outline\nH2: Pricing | Show & compare\n\n- Use our page (https://a.com)");
});

test("a generated draft keeps its tags and loses scripts, styles, handlers and fences", () => {
  const out = cleanDraftHtml('Here you go:\n```html\n<h1 class="x">Title</h1><p onclick="steal()" style="color:red">Hi <a href="javascript:alert(1)">x</a></p><script>bad()</script><style>p{}</style>\n```');
  assert.equal(out, '<h1>Title</h1><p>Hi <a href="#">x</a></p>');
});
