import { test } from "node:test";
import assert from "node:assert/strict";
import { briefSkeleton, contentPairs, docToText, FAQ_H2, letter, notesFor, pairCount, partNodes, partOfPair, planOf, replacePart, splitDoc, summarize, type BriefPlan } from "../src/lib/articleGrid.ts";
import type { PmNode } from "../src/lib/docHtml.ts";

const t = (text: string): PmNode => ({ type: "text", text });
const p = (text: string): PmNode => ({ type: "paragraph", content: [t(text)] });
const h = (level: number, text: string): PmNode => ({ type: "heading", attrs: { level }, content: [t(text)] });
const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });
const img: PmNode = { type: "image", attrs: { src: "https://x.com/a.png", alt: "Chart" } };
const embed: PmNode = { type: "embed", attrs: { html: "<div>calc</div>" } };
const list: PmNode = { type: "bulletList", content: [{ type: "listItem", content: [p("One")] }, { type: "listItem", content: [p("Two")] }] };

const article = doc(p("Hook."), p("Promise."), h(2, "Pricing"), p("Plans."), img, h(3, "Free tier"), p("Yes."), h(2, "Verdict"), list, embed, h(2, "FAQ"), p("Q?"));

test("an article splits into its intro and one section per H2, with H3s inside their section", () => {
  const s = splitDoc(article);
  assert.equal(s.intro.length, 2);
  assert.deepEqual(s.sections.map((x) => x.h2), ["Pricing", "Verdict", "FAQ"]);
  assert.equal(s.sections[0].nodes.length, 5);
  assert.deepEqual(splitDoc(doc(p("Only text."))).sections, []);
  assert.deepEqual(splitDoc(null), { intro: [], sections: [] });
});

test("a written draft fills H1 and Section 1 with its title and intro, then each H2 and its text", () => {
  const pairs = contentPairs({ title: "SEO Agency Guide", content: article }, { h1: "Old plan", outline: ["X"] });
  assert.deepEqual(pairs.map((x) => x.heading), ["SEO Agency Guide", "Pricing", "Verdict", "FAQ"]);
  assert.equal(pairs[0].body?.preview, "Hook. Promise.");
  assert.equal(pairs[1].body?.preview, "Plans. Free tier Yes.");
  assert.deepEqual(pairs[1].body?.has, ["image"]);
  assert.deepEqual(pairs[2].body?.has, ["list", "html"]);
  assert.equal(pairs[3].body?.words, 1);
});

const plan: BriefPlan = {
  h1: "Best GEO tools in 2026",
  intro: ["Real prices", "Compare tools"],
  outline: [
    { h2: "What GEO means", points: ["Define it"], h3: [], sources: [{ n: 1, title: "A", url: "https://a.com" }] },
    { h2: "The 9 tools", points: ["Price each"], h3: ["Profound", "Peec AI"], sources: [] },
  ],
  faqs: [{ question: "Is GEO worth it?", answer: "Yes, say why." }],
};

test("before the doc the brief's H1, outline and FAQ fill the headings and the sections stay empty", () => {
  assert.deepEqual(contentPairs(null, plan), [
    { heading: "Best GEO tools in 2026", body: null },
    { heading: "What GEO means", body: null },
    { heading: "The 9 tools", body: null },
    { heading: FAQ_H2, body: null },
  ]);
  assert.deepEqual(contentPairs(null, null), []);
});

test("the brief starts a doc with an empty intro, each H2 with its H3s, and the FAQ questions, all empty", () => {
  const d = briefSkeleton(plan);
  const s = splitDoc(d);
  assert.deepEqual(s.intro, [{ type: "paragraph" }]);
  assert.deepEqual(s.sections.map((x) => x.h2), ["What GEO means", "The 9 tools", FAQ_H2]);
  assert.deepEqual(s.sections[1].nodes.map((n) => n.type), ["heading", "heading", "paragraph", "heading", "paragraph"]);
  assert.equal(s.sections[2].nodes[1].content?.[0].text, "Is GEO worth it?");
  // The skeleton's pairs line up with the brief's.
  assert.deepEqual(contentPairs({ title: plan.h1, content: d }, null).map((p) => p.heading), contentPairs(null, plan).map((p) => p.heading));
  assert.equal(contentPairs({ title: plan.h1, content: d }, null)[1].body?.words, 0);
});

test("each section shows what the brief says to write in it, found by its H2", () => {
  assert.deepEqual(notesFor(plan, "intro", ""), { points: ["Real prices", "Compare tools"], sources: [] });
  assert.deepEqual(notesFor(plan, 0, " what geo MEANS "), { points: ["Define it"], sources: [{ n: 1, title: "A", url: "https://a.com" }] });
  assert.deepEqual(notesFor(plan, 1, "The 9 tools")?.points, ["Price each", "H3: Profound", "H3: Peec AI"]);
  assert.deepEqual(notesFor(plan, 2, FAQ_H2)?.points, ["Is GEO worth it? Yes, say why."]);
  assert.equal(notesFor(plan, 3, "A heading the writer added"), null);
  assert.equal(notesFor(null, "intro", ""), null);
});

test("a section's edit goes back into its own slice, and keeps its H2 when it comes back without one", () => {
  assert.equal(partOfPair(0), "intro");
  assert.equal(partOfPair(3), 2);
  const next = replacePart(article, 1, [h(2, "Verdict"), p("Pick Pro.")]);
  assert.deepEqual(partNodes(next, 1), [h(2, "Verdict"), p("Pick Pro.")]);
  assert.deepEqual(partNodes(next, 0), partNodes(article, 0));
  assert.deepEqual(partNodes(next, 2), partNodes(article, 2));
  assert.deepEqual(partNodes(replacePart(article, 0, [p("New body.")]), 0), [h(2, "Pricing"), p("New body.")]);
  const intro = replacePart(article, "intro", [p("Hook."), h(2, "Why now"), p("Because.")]);
  assert.deepEqual(splitDoc(intro).sections.map((x) => x.h2), ["Why now", "Pricing", "Verdict", "FAQ"]);
});

test("the grid always shows 20 pairs, more when someone adds them, and never fewer than an article needs", () => {
  assert.equal(pairCount(4, 0), 20);
  assert.equal(pairCount(4, 3), 23);
  assert.equal(pairCount(26, 0), 26);
  assert.equal(pairCount(4, -2), 20);
});

test("a section's face counts its words and names what is inside", () => {
  const s = summarize([p("Plans from $9."), list]);
  assert.equal(s.preview, "Plans from $9. One Two");
  assert.equal(s.words, 5);
  assert.deepEqual(s.has, ["list"]);
  assert.deepEqual(summarize([]), { preview: "", words: 0, has: [] });
});

test("plain text has every heading, paragraph, list item and table row, and no HTML", () => {
  const table: PmNode = { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [p("Plan")] }, { type: "tableHeader", content: [p("Price")] }] }, { type: "tableRow", content: [{ type: "tableCell", content: [p("Pro")] }, { type: "tableCell", content: [p("$99")] }] }] };
  const text = docToText(doc(h(2, "Verdict"), list, table, img, embed, { type: "orderedList", content: [{ type: "listItem", content: [p("First")] }] }));
  assert.equal(text, "Verdict\n\n- One\n\n- Two\n\nPlan | Price\n\nPro | $99\n\n[Image: Chart]\n\n1. First");
});

test("columns are lettered like a sheet", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letter), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
});

test("the grid reads the brief's titles, meta, intro notes, outline with sources by number, and FAQs", () => {
  const g = planOf({
    h1: "H",
    titles: ["SEO title"],
    metaDescription: "D",
    slug: "s",
    angle: "Angle",
    searchIntent: "",
    outline: [{ h2: "One", points: ["p"], h3: [{ title: "Sub" }], sources: [2, 9] }],
    faqs: [{ question: "Q?" }],
    research: { sources: [{ n: 2, title: "B", url: "https://b.com" }] },
  });
  assert.deepEqual(g, {
    h1: "H", title: "SEO title", description: "D", slug: "s", intro: ["Angle"],
    outline: [{ h2: "One", points: ["p"], h3: ["Sub"], sources: [{ n: 2, title: "B", url: "https://b.com" }] }],
    faqs: [{ question: "Q?", answer: "" }],
  });
  assert.equal(planOf(null), null);
  assert.equal(planOf({ h1: "Only" })?.title, "Only");
});
