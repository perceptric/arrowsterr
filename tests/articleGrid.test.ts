import { test } from "node:test";
import assert from "node:assert/strict";
import { contentPairs, docToText, letter, pairCount, splitDoc, summarize } from "../src/lib/articleGrid.ts";
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

test("before the draft the brief's H1 and outline fill the headings and the sections stay empty", () => {
  const pairs = contentPairs(null, { h1: "Best GEO tools", outline: ["What GEO means", "The 9 tools"] });
  assert.deepEqual(pairs, [
    { heading: "Best GEO tools", body: null },
    { heading: "What GEO means", body: null },
    { heading: "The 9 tools", body: null },
  ]);
  assert.deepEqual(contentPairs(null, null), []);
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
