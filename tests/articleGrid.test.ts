import { test } from "node:test";
import assert from "node:assert/strict";
import { addSection, docToText, fillPrompt, joinDoc, keepLocked, letter, lockKey, moveSection, partNodes, removeSection, replacePart, splitDoc, summarize } from "../src/lib/articleGrid.ts";
import type { PmNode } from "../src/lib/docHtml.ts";
import type { WriterBrief } from "../src/lib/writerBrief.ts";
import { cellPlan, sectionNodes } from "../src/lib/writerDraft.ts";

const t = (text: string): PmNode => ({ type: "text", text });
const p = (text: string): PmNode => ({ type: "paragraph", content: [t(text)] });
const h = (level: number, text: string): PmNode => ({ type: "heading", attrs: { level }, content: [t(text)] });
const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });
const img: PmNode = { type: "image", attrs: { src: "https://x.com/a.png", alt: "Chart" } };
const embed: PmNode = { type: "embed", attrs: { html: "<div>calc</div>" } };
const list: PmNode = { type: "bulletList", content: [{ type: "listItem", content: [p("One")] }, { type: "listItem", content: [p("Two")] }] };

const article = doc(p("Hook."), p("Promise."), h(2, "Pricing"), p("Plans."), img, h(3, "Free tier"), p("Yes."), h(2, "Verdict"), list, embed, h(2, "FAQ"), p("Q?"));
const h2s = (c: unknown) => splitDoc(c).sections.map((s) => s.h2);

test("an article splits into its intro and one section per H2, and joins back the same", () => {
  const s = splitDoc(article);
  assert.equal(s.intro.length, 2);
  assert.deepEqual(h2s(article), ["Pricing", "Verdict", "FAQ"]);
  assert.equal(s.sections[0].nodes.length, 5); // the H2, a paragraph, an image, an H3 and its paragraph
  assert.deepEqual(joinDoc(s), article);
});

test("a doc with no H2 is all intro, and an empty doc keeps one paragraph", () => {
  assert.deepEqual(splitDoc(doc(p("Only text."))).sections, []);
  assert.deepEqual(joinDoc(splitDoc(doc())), doc({ type: "paragraph" }));
  assert.deepEqual(splitDoc(null), { intro: [], sections: [] });
});

test("moving a section moves its whole slice and nothing else", () => {
  const moved = moveSection(article, 2, 0);
  assert.deepEqual(h2s(moved), ["FAQ", "Pricing", "Verdict"]);
  assert.deepEqual(splitDoc(moved).intro, splitDoc(article).intro);
  assert.deepEqual(partNodes(moved, 1), partNodes(article, 0));
  assert.deepEqual(moveSection(article, 0, 9), article);
  assert.deepEqual(moveSection(article, -1, 0), article);
});

test("a cell's edit goes back into its own slice", () => {
  const next = replacePart(article, 1, [h(2, "Verdict"), p("Pick Pro.")]);
  assert.deepEqual(partNodes(next, 1), [h(2, "Verdict"), p("Pick Pro.")]);
  assert.deepEqual(partNodes(next, 0), partNodes(article, 0));
  assert.deepEqual(partNodes(next, 2), partNodes(article, 2));
});

test("a section edited without its H2 keeps its old one, and an extra H2 starts a new section", () => {
  const kept = replacePart(article, 0, [p("New body.")]);
  assert.deepEqual(partNodes(kept, 0), [h(2, "Pricing"), p("New body.")]);
  const split = replacePart(article, 0, [h(2, "Pricing"), p("A."), h(2, "Discounts"), p("B.")]);
  assert.deepEqual(h2s(split), ["Pricing", "Discounts", "Verdict", "FAQ"]);
});

test("an H2 typed into the intro becomes the first section", () => {
  const next = replacePart(article, "intro", [p("Hook."), h(2, "Why now"), p("Because.")]);
  assert.deepEqual(splitDoc(next).intro, [p("Hook.")]);
  assert.deepEqual(h2s(next), ["Why now", "Pricing", "Verdict", "FAQ"]);
});

test("sections can be added and removed", () => {
  assert.deepEqual(h2s(addSection(article, "Setup", 0)), ["Pricing", "Setup", "Verdict", "FAQ"]);
  assert.deepEqual(h2s(addSection(article, "End")), ["Pricing", "Verdict", "FAQ", "End"]);
  assert.deepEqual(h2s(removeSection(article, 1)), ["Pricing", "FAQ"]);
});

test("a cell's face names what is inside it", () => {
  const s = summarize(partNodes(article, 0));
  assert.equal(s.title, "Pricing");
  assert.equal(s.preview, "Plans. Free tier Yes.");
  assert.deepEqual(s.has, ["image"]);
  assert.deepEqual(summarize(partNodes(article, 1)).has, ["list", "html"]);
  assert.equal(summarize(splitDoc(article).intro).title, "");
  assert.equal(summarize(splitDoc(article).intro).words, 2);
});

test("a regenerated draft keeps the locked intro and sections and takes the rest from the new draft", () => {
  const fresh = doc(p("New hook."), h(2, "pricing "), p("New plans."), h(2, "Verdict"), p("New verdict."), h(2, "FAQ"), p("New Q?"));
  const out = keepLocked(article, fresh, ["intro", "Pricing"]);
  assert.deepEqual(splitDoc(out).intro, splitDoc(article).intro);
  assert.deepEqual(partNodes(out, 0), partNodes(article, 0));
  assert.deepEqual(partNodes(out, 1), [h(2, "Verdict"), p("New verdict.")]);
  assert.deepEqual(keepLocked(article, fresh, []), fresh);
});

test("a locked section the new draft dropped goes back to its old place", () => {
  const fresh = doc(p("New hook."), h(2, "Pricing"), p("New plans."), h(2, "FAQ"), p("New Q?"));
  const out = keepLocked(article, fresh, ["verdict"]);
  assert.deepEqual(h2s(out), ["Pricing", "Verdict", "FAQ"]);
  assert.deepEqual(partNodes(out, 1), partNodes(article, 1));
});

test("lock keys are the H2 in lower case, or intro", () => {
  assert.equal(lockKey("intro", article), "intro");
  assert.equal(lockKey(0, doc(h(2, "  Big   Pricing "))), "big pricing");
});

test("plain text has every heading, paragraph, list item and table row, and no HTML", () => {
  const table: PmNode = { type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [p("Plan")] }, { type: "tableHeader", content: [p("Price")] }] }, { type: "tableRow", content: [{ type: "tableCell", content: [p("Pro")] }, { type: "tableCell", content: [p("$99")] }] }] };
  const text = docToText(doc(h(2, "Verdict"), list, table, img, embed, { type: "orderedList", content: [{ type: "listItem", content: [p("First")] }] }));
  assert.equal(text, "Verdict\n\n- One\n\n- Two\n\nPlan | Price\n\nPro | $99\n\n[Image: Chart]\n\n1. First");
});

test("columns are lettered like a sheet", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letter), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
});

test("an AI column's prompt reads other columns by letter or name", () => {
  const cols = [
    { letter: "A", name: "Keyword", value: "seo agency" },
    { letter: "F", name: "H1", value: "SEO Agency Guide" },
  ];
  assert.equal(fillPrompt("Post about {{F}} for {{ keyword }}. {{Z}}", cols), "Post about SEO Agency Guide for seo agency. {{Z}}");
  assert.equal(fillPrompt("{{h1}}", cols), "SEO Agency Guide");
});

// ─────────────── writing one cell again ───────────────

const brief = {
  titles: ["T"], h1: "T", metaDescription: "", slug: "t", searchIntent: "Compare", reader: "Lead", angle: "Real prices", wordTarget: 1500,
  outline: [{ h2: "Pricing", points: ["Plans"], h3: [], sources: [1] }, { h2: "Verdict", points: ["Pick"], h3: [], sources: [] }],
  entities: [], gaps: [], faqs: [{ question: "Free?", answer: "Yes" }], internalLinks: [], cta: { text: "", where: "" }, modules: [],
  research: { topPages: "", aiAnswers: "", sources: [], questions: [], engines: [] }, model: "m", at: "",
} as WriterBrief;

test("a cell is written again from its own plan in the brief", () => {
  assert.equal(cellPlan(brief, { kind: "intro" }).i, 0);
  const { plan, i } = cellPlan(brief, { kind: "section", h2: " verdict ", index: 1 });
  assert.equal(plan[i].h2, "Verdict");
  assert.deepEqual(plan[i].points, ["Pick"]);
  assert.equal(plan.length, 4); // intro, two sections, FAQ
});

test("a section the person added gets a plan from its H2, where it sits", () => {
  const { plan, i } = cellPlan(brief, { kind: "section", h2: "Setup", index: 0 });
  assert.equal(i, 1);
  assert.equal(plan[i].h2, "Setup");
  assert.deepEqual(plan.map((x) => x.h2), ["", "Setup", "Pricing", "Verdict", "Frequently asked questions"]);
});

test("a written section becomes editor nodes, with its H2 first and none for the intro", () => {
  const nodes = sectionNodes({ key: "h2-0", h2: "Pricing", blocks: [{ type: "p", text: "From **$9**.", items: [], rows: [] }, { type: "ul", text: "", items: ["A"], rows: [] }] });
  assert.deepEqual(nodes.map((n) => n.type), ["heading", "paragraph", "bulletList"]);
  assert.equal(summarize(nodes as PmNode[]).title, "Pricing");
  assert.equal(sectionNodes({ key: "intro", h2: "", blocks: [{ type: "p", text: "Hi.", items: [], rows: [] }] })[0].type, "paragraph");
});
