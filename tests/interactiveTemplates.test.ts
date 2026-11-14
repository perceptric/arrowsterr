import { test } from "node:test";
import assert from "node:assert/strict";
import type { FactNote } from "../src/lib/articleNotes.ts";
import { buildTemplate, calcResult, checkCalculator, checkPicker, TEMPLATE_BUDGET, type CalculatorSpec } from "../src/lib/interactiveTemplates.ts";
import { validateModule } from "../src/lib/writerModules.ts";
import { framedModules } from "../src/lib/wpModules.ts";
import { buildDoc, runDraft, type DraftRow, type DraftStore, type DraftDeps } from "../src/lib/writerDraft.ts";
import type { BriefRow, PlannedModule, ResearchPack, WriterBrief, WriterContext } from "../src/lib/writerBrief.ts";

// Draft and Write, Phase 3: the picker and the calculator, built by code from a checked spec.

const notes: FactNote[] = [
  { id: "n1", source: 1, quote: "Most running shoes last 500 to 800 km before the foam wears out", fact: "Running shoes last 500 to 800 km.", numbers: ["500", "800"] },
  { id: "n2", source: 2, quote: "Pipedrive starts at $14 a month per seat, billed yearly", fact: "Pipedrive costs $14 a month per seat.", numbers: ["14"] },
];
const sources = [
  { n: 1, domain: "runnersworld.com" },
  { n: 2, domain: "pipedrive.com" },
];
const shoes = {
  title: "When to replace your shoes",
  formula: "divide",
  input: { label: "Km you run a week", value: 30, min: 5, max: 150, step: 5, prefix: "", suffix: " km" },
  factor: { low: 500, high: 800, label: "500 to 800 km per pair" },
  result: { label: "Weeks a pair lasts", prefix: "", suffix: " weeks" },
  note: "n1",
};

test("a calculator spec is kept only when its formula is in the set and its numbers are in one note's quote", () => {
  assert.equal(checkCalculator({ ...shoes, factor: { ...shoes.factor, high: 900 } }, notes).ok, false);
  assert.equal(checkCalculator({ ...shoes, formula: "square" }, notes).ok, false);
  assert.equal(checkCalculator({ ...shoes, note: "n7" }, notes).ok, false);
  assert.equal(checkCalculator({ ...shoes, input: { ...shoes.input, min: 0 } }, notes).ok, false, "divide needs an input above 0");
  assert.equal(checkCalculator({ ...shoes, input: { ...shoes.input, value: 400 } }, notes).ok, false);
  assert.equal(checkCalculator(shoes, notes).ok, true);
  const seats = { ...shoes, formula: "multiply", factor: { low: 14, high: 14, label: "$14 per seat a month" }, note: "n2", input: { ...shoes.input, value: 5, min: 1, suffix: " seats" }, result: { label: "Cost a month", prefix: "$", suffix: "" } };
  assert.equal(calcResult(checkCalculator(seats, notes).ok ? (seats as CalculatorSpec) : (seats as CalculatorSpec), 5), "$70");
  assert.equal(calcResult(shoes as CalculatorSpec, 30), "16.7 weeks to 26.7 weeks");
  assert.equal(calcResult({ ...(seats as CalculatorSpec), formula: "percent", factor: { low: 3, high: 3, label: "" } }, 1200), "$36");
});

test("a picker spec is kept only when every pick is the article's and every answer points to a pick", () => {
  const picks = ["Asana", "Trello", "Monday.com"];
  const good = {
    title: "Which tool fits your team",
    picks: [
      { name: "Asana", why: "Teams that plan projects with many steps." },
      { name: "trello", why: "Small teams that want boards and nothing else." },
    ],
    questions: [{ text: "How do you plan work?", answers: [{ label: "Projects with steps", pick: "Asana" }, { label: "Simple boards", pick: "Trello" }] }],
  };
  const c = checkPicker(good, picks);
  assert.ok(c.ok);
  assert.equal(c.ok && c.spec.picks[1].name, "Trello", "names come back as the article writes them");
  assert.equal(checkPicker({ ...good, picks: [...good.picks, { name: "Jira", why: "x" }] }, picks).ok, false);
  assert.equal(checkPicker({ ...good, questions: [{ text: "Q", answers: [{ label: "A", pick: "Asana" }, { label: "B", pick: "Basecamp" }] }] }, picks).ok, false);
  assert.equal(checkPicker({ ...good, questions: [{ text: "Q", answers: [{ label: "A", pick: "Asana" }, { label: "B", pick: "Asana" }] }] }, picks).ok, false, "Trello can't be reached");
  assert.equal(checkPicker(good, ["Asana"]).ok, false);
});

test("both templates pass the module checks, fit the size budget, keep text safe and survive the CMS frame", () => {
  const calc = buildTemplate("calculator", { ...shoes, title: 'Shoes <script>alert("x")</script>' }, { notes, picks: [], sources });
  assert.ok(calc.ok);
  assert.deepEqual(validateModule(calc.html), { ok: true });
  assert.ok(!calc.html.includes("<script>alert"), "text is escaped");
  assert.ok(calc.html.includes("16.7 weeks to 26.7 weeks"), "the default result is in the markup");
  assert.match(calc.text[0].text, /Weeks a pair lasts = 500 to 800 km per pair ÷ Km you run a week\. For 30 km, that's 16\.7 weeks to 26\.7 weeks\. Source: runnersworld\.com\./);
  const pick = buildTemplate(
    "picker",
    { title: "Pick", picks: [{ name: "Asana", why: "Many steps." }, { name: "Trello", why: "Boards." }], questions: [{ text: "How?", answers: [{ label: "Steps", pick: "Asana" }, { label: "Boards", pick: "Trello" }] }] },
    { notes, picks: ["Asana", "Trello"], sources },
  );
  assert.ok(pick.ok);
  assert.deepEqual(validateModule(pick.html), { ok: true });
  assert.deepEqual(pick.text[0].items, ["Asana: Many steps. Fits if: Steps.", "Trello: Boards. Fits if: Boards."]);
  for (const b of [calc, pick]) {
    assert.ok(b.ok && b.html.length < TEMPLATE_BUDGET);
    // Webflow, Shopify, HubSpot and Framer get the module as a sandboxed iframe (framedModules).
    const framed = framedModules(`<div data-aw-module="m1" data-aw-title="T" data-aw-src="${Buffer.from(b.ok ? b.html : "").toString("base64")}"></div>`);
    assert.match(framed, /<iframe [^>]*sandbox="allow-scripts"/);
  }
});

// ─────────────── in the draft ───────────────
const mod = (over: Partial<PlannedModule> = {}): PlannedModule => ({ type: "calculator", title: "Shoe life", purpose: "Weeks a pair lasts", placement: "How long shoes last", inputs: [], outputs: [], data: "", why: "", ...over });
const brief: WriterBrief = {
  titles: ["Shoes"], h1: "When to replace running shoes", metaDescription: "", slug: "shoes", searchIntent: "", reader: "", angle: "", wordTarget: 600,
  outline: [{ h2: "How long shoes last", points: ["Km"], h3: [], sources: [1] }], entities: [], gaps: [], faqs: [], internalLinks: [], cta: { text: "", where: "" },
  modules: [mod()], images: [], examples: [], notes,
  cards: [{ key: "intro", h2: "", job: "j", points: ["p"], facts: [], visual: null, words: 200, links: [], gaps: [] }, { key: "h2-0", h2: "How long shoes last", job: "j", points: ["p"], facts: ["n1"], visual: null, words: 400, links: [], gaps: [] }],
  research: { topPages: "", aiAnswers: "", sources: [{ n: 1, url: "https://runnersworld.com/a", title: "", domain: "runnersworld.com", kind: "serp", position: 1, words: 1 }], questions: [], engines: [] },
  model: "m", at: "",
};

test("a built template goes in the doc with its plain version, and one that fails twice leaves a note", () => {
  const ok = buildTemplate("calculator", shoes, { notes, picks: [], sources });
  assert.ok(ok.ok);
  const sections = [{ key: "h2-0", h2: "How long shoes last", blocks: [{ type: "p" as const, text: "Shoes wear out.", items: [], rows: [] }] }];
  const doc = buildDoc(brief, sections, [{ module: brief.modules[0], html: ok.html, text: ok.text }]);
  const types = (doc.content.content as { type: string }[]).map((n) => n.type);
  assert.deepEqual(types, ["heading", "paragraph", "embed", "paragraph"]);
  const noted = buildDoc(brief, sections, [], null, null, [{ module: brief.modules[0], error: "The factor 900 isn't in n1's quote." }]);
  const note = (noted.content.content as { type: string; content?: { text: string }[] }[]).find((n) => n.type === "note");
  assert.equal(note?.content?.[0].text, "Add calculator: Shoe life. The factor 900 isn't in n1's quote.");
});

const pack: ResearchPack = { keyword: "replace running shoes", pages: [{ url: "https://runnersworld.com/a", title: "", domain: "runnersworld.com", kind: "serp", position: 1, words: 1, headings: [], body: notes[0].quote }], questions: [], aiOverview: "", answers: [] };
const ctx: WriterContext = { brand: { name: "Acme", domain: "acme.com" }, voice: null, kit: null, guidelines: null, sitemap: [] };
const row: BriefRow = { id: "b1", workspace_id: "w", brand_id: null, site_id: "s", item_id: "i", keyword: "replace running shoes", research_run_id: "r", status: "approved", step: "done", brief, notes: "", note: null, version: 1, error: null };

async function draftWith(specs: unknown[]) {
  let d: DraftRow = { id: "d1", workspace_id: "w", brand_id: null, site_id: "s", item_id: "i", brief_id: "b1", doc_id: null, status: "generating", step: "sections", version: 1, note: null, sections: [], checked: null, check_at: null, modules: [], period: "p", words: 0, error: null, ready_at: null };
  let saved: { content: { content: { type: string; content?: { text: string }[]; attrs?: { html?: string } }[] } } | null = null;
  const store: DraftStore = { draft: async () => structuredClone(d), brief: async () => structuredClone(row), update: async (_id, patch) => void (d = { ...d, ...structuredClone(patch) }), saveDoc: async (_d, doc) => ((saved = doc as never), "doc1") };
  const calls = { spec: 0, module: 0 };
  const deps: DraftDeps = {
    context: async () => ({ ctx, pack }),
    writeSection: async () => ({ blocks: [{ type: "p", text: "Shoes wear out over time for every runner.", items: [], rows: [] }] }),
    check: async () => ({ cut: [] }),
    buildModule: async () => (calls.module++, { html: "" }),
    spec: async () => specs[calls.spec++] ?? specs[specs.length - 1],
    model: "m",
  };
  assert.deepEqual(await runDraft(store, deps, "d1", 1), { state: "done" });
  return { d, doc: saved!, calls };
}

test("the draft builds a calculator from its spec without asking for HTML, and retries a bad spec once", async () => {
  const good = await draftWith([{ ...shoes, factor: { ...shoes.factor, high: 900 } }, shoes]);
  assert.deepEqual(good.calls, { spec: 2, module: 0 });
  assert.equal(good.d.modules[0]?.status, "ok");
  const embed = good.doc.content.content.find((n) => n.type === "embed");
  assert.ok(embed?.attrs?.html?.includes('data-module="calculator"'));
  const bad = await draftWith([{ ...shoes, note: "n9" }]);
  assert.equal(bad.d.modules[0]?.status, "dropped");
  assert.ok(bad.doc.content.content.some((n) => n.type === "note" && n.content?.[0].text.startsWith("Add calculator: Shoe life.")));
});

test("a template carries its phone height into the published block, for CMSs with fixed frames", async () => {
  const { docToHtml } = await import("../src/lib/docHtml.ts");
  const ok = buildTemplate("calculator", shoes, { notes, picks: [], sources });
  assert.ok(ok.ok);
  const h = Number(ok.html.match(/data-aw-h="(\d+)"/)?.[1]);
  assert.ok(h >= 400 && h <= 1400);
  const html = docToHtml({ type: "doc", content: [{ type: "embed", attrs: { html: ok.html } }] });
  assert.match(html, new RegExp(`data-aw-height="${h}"`));
  assert.match(framedModules(html), new RegExp(`height:${h}px`));
});

test("a picker can choose between options its headings name, adds a featured pick its answers reach, and trims to 5", () => {
  const vs = checkPicker(
    { title: "Which fits", picks: [{ name: "Kanban", why: "Teams with a steady flow of work." }, { name: "Scrum", why: "Teams that plan in sprints." }], questions: [{ text: "How does work arrive?", answers: [{ label: "All the time", pick: "kanban" }, { label: "In batches", pick: "Scrum" }] }] },
    { picks: [], headings: ["Kanban vs Scrum: Which Fits Your Team", "What Kanban is", "What Scrum is"] },
  );
  assert.ok(vs.ok, vs.ok ? "" : vs.error);
  assert.equal(checkPicker({ title: "x", picks: [{ name: "Waterfall", why: "y" }, { name: "Scrum", why: "z" }], questions: [] }, { picks: [], headings: ["What Scrum is"] }).ok, false);
  const added = checkPicker(
    { title: "Which tool", picks: [{ name: "Asana", why: "Many steps." }], questions: [{ text: "How?", answers: [{ label: "Steps", pick: "Asana" }, { label: "Boards", pick: "Trello" }] }] },
    { picks: ["Asana", "Trello"], about: { Trello: "Trello is a board tool for small teams." } },
  );
  assert.ok(added.ok);
  assert.deepEqual(added.ok && added.spec.picks.map((p) => p.name), ["Asana", "Trello"]);
  const many = ["A1", "B2", "C3", "D4", "E5", "F6", "G7"];
  const trimmed = checkPicker(
    { title: "t", picks: many.map((name) => ({ name, why: "w" })), questions: [{ text: "q", answers: many.slice(0, 4).map((p) => ({ label: p, pick: p })) }] },
    { picks: many },
  );
  assert.ok(trimmed.ok);
  assert.equal(trimmed.ok && trimmed.spec.picks.length, 4);
});
