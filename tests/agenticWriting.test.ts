import assert from "node:assert/strict";
import test from "node:test";
import { defaultVoice, fallbackGuidelines, guidelinesBody } from "../src/lib/brandSetup.ts";
import { DEFAULT_SAMPLE, fixTitleCount, HOUSE_RULES, lintDraft, lintText, rulesText } from "../src/lib/houseRules.ts";
import { SKILL_TEXT } from "../src/lib/skillText.ts";
import { cleanBrief, readExamples, webUrl, withExampleShots, type BriefRow, type ResearchPack, type WriterBrief, type WriterContext } from "../src/lib/writerBrief.ts";
import { buildDoc, exampleFor, runDraft, sourcesFor, type DraftDeps, type DraftRow, type DraftStore, type Section } from "../src/lib/writerDraft.ts";
import { keepsFacts, mergeFindings, STYLE_SYSTEM } from "../src/lib/writerStyle.ts";
import type { ImagesOut } from "../src/lib/writerImageTypes.ts";

const p = (text: string) => ({ type: "p" as const, text, items: [], rows: [] });
const ul = (...items: string[]) => ({ type: "ul" as const, text: "", items, rows: [] });

// ─────────────── the lint ───────────────
test("the lint catches each house rule and passes the clean version", () => {
  const rules = (t: string) => lintText(t).map((f) => f.rule);
  assert.ok(rules("SEO takes time — and patience.").includes("dashes"));
  assert.ok(rules("This guide is not just a list, but a plan for your whole team.").includes("dashes"));
  assert.ok(rules("Content works best when it's useful, not loud.").includes("dashes"));
  assert.ok(rules("That's it.").includes("plain"));
  assert.ok(rules("The result? A blog people read every week without fail.").includes("plain"));
  assert.ok(rules("It works.").includes("sentences"));
  assert.ok(rules("Most blogs fail because the topics are random and nobody plans them.").includes("kind"));
  assert.ok(rules("We delve into the details of every plan for your team.").includes("words"));
  assert.ok(rules("They quietly shipped a new plan for small teams this year.").includes("adverbs"));
  assert.ok(rules("Our pricing page is live for everyone who signs up today!").includes("dashes"));
  // Clean lines pass.
  assert.deepEqual(lintText("Ahrefs is an SEO software company that sells tools for keyword research and backlink analysis."), []);
  assert.deepEqual(lintText("Why it works:"), [], "a lead-in to a list is fine");
  assert.deepEqual(lintText("Short item", { inList: true }), [], "list items may be short");
  assert.ok(lintText("**HubSpot:** a CRM for growing teams.", { inList: true }).some((f) => f.rule === "lists"), "no bold lead-ins in lists");
});

test("the lint looks at whole sections: long paragraphs, missing lists, repeated adverbs and example openers", () => {
  const long = Array.from({ length: 5 }, (_, i) => `This is sentence number ${i + 1} and it explains one more part of the plan for your team.`).join(" ");
  const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
  const sections: Section[] = [
    { key: "intro", h2: "", blocks: [p(long)] },
    { key: "h2-0", h2: "1. HubSpot Blog", blocks: [p("The blog is split by team, so each reader lands in a section built for them."), p("Thankfully, the posts link to free templates you can download right away.")] },
    { key: "h2-1", h2: "2. Ahrefs Blog", blocks: [p("Ahrefs is an SEO software company that sells tools for keyword research and links."), p("Thankfully, every tutorial shows the steps inside the product itself, one by one.")] },
    { key: "h2-2", h2: "Plan your topics", blocks: [p(`${words(170)}.`), p(`${words(170)}.`), ul("One idea.", "Another idea.")] },
  ];
  const found = lintDraft(sections, [{ name: "HubSpot Blog" }, { name: "Ahrefs Blog" }]);
  const has = (id: string, rule: string) => found.some((f) => f.id === id && f.rule === rule);
  assert.ok(has("0.0.0", "paragraphs"), "five sentences is too long");
  assert.ok(has("1.0.0", "opener"), "HubSpot's section doesn't say what HubSpot is");
  assert.ok(!found.some((f) => f.id.startsWith("2.0") && f.rule === "opener"), "Ahrefs opens right");
  assert.ok(has("2.1.0", "adverbs"), "the second Thankfully is flagged");
  assert.ok(found.some((f) => f.id.startsWith("3.") && f.rule === "lists"), "more than 300 words without a list");
});

test("the proofread fixes a title whose count doesn't match the article", () => {
  const h2s = ["How we picked", "1. HubSpot", "2. Ahrefs", "3. Zapier", "How to choose"];
  assert.equal(fixTitleCount("10 Best Business Blog Examples in 2026", h2s, 0), "3 Best Business Blog Examples in 2026");
  assert.equal(fixTitleCount("3 Best Business Blog Examples", h2s, 0), null);
  assert.equal(fixTitleCount("Business Blog Examples", h2s, 0), null, "no number, nothing to fix");
  assert.equal(fixTitleCount("12 Examples of Pillar Pages", ["Intro", "Pillar pages"], 11), "11 Examples of Pillar Pages", "falls back to the examples count");
});

// ─────────────── the style passes ───────────────
test("a style fix that changes a number or a link is thrown away", () => {
  const before: Section = { key: "h2-0", h2: "Pricing", blocks: [p("Pipedrive starts at $14 a month [per A](https://a.com/crm). It works.")] };
  assert.ok(keepsFacts(before, { ...before, blocks: [p("Pipedrive is a sales CRM that starts at $14 a month, [per A](https://a.com/crm), for small teams.")] }));
  assert.ok(!keepsFacts(before, { ...before, blocks: [p("Pipedrive starts at $15 a month [per A](https://a.com/crm).")] }), "a changed number");
  assert.ok(!keepsFacts(before, { ...before, blocks: [p("Pipedrive starts at $14 a month.")] }), "a lost link");
  assert.ok(!keepsFacts(before, { ...before, blocks: [p("Pipedrive starts at $14 a month [per A](https://a.com/crm) and has 100,000 customers.")] }), "an added number");
});

test("review findings are kept only for lines that exist, once each", () => {
  const ids = new Set(["0.0.0", "1.0.0", "1.0.1"]);
  const out = mergeFindings([{ id: "0.0.0", rule: "dashes", why: "a dash" }], { findings: [{ id: "0.0.0", rule: "dashes", why: "dash again" }, { id: "1.0.1", rule: "plain", why: "a reveal" }, { id: "9.9.9", rule: "kind", why: "made up" }] }, ids);
  assert.deepEqual(
    out.map((f) => `${f.id}:${f.rule}`),
    ["0.0.0:dashes", "1.0.1:plain"],
  );
});

test("the writing skills and the house rules go into the style system prompt", () => {
  for (const key of ["humanizer", "antiAi", "enforcer", "claims", "proofread"] as const) assert.ok(SKILL_TEXT[key].length > 200, key);
  assert.match(STYLE_SYSTEM, /Method 1: Humanizer/);
  assert.match(STYLE_SYSTEM, /Method 2: Anti-AI writing/);
  assert.ok(STYLE_SYSTEM.includes(rulesText()));
  assert.equal(HOUSE_RULES.length, new Set(HOUSE_RULES.map((r) => r.id)).size);
  assert.ok(!/[—–]/.test(DEFAULT_SAMPLE), "the default sample has no dashes");
});

// ─────────────── brand setup ───────────────
test("a brand without a voice gets the default voice with its own name, and guidelines from its homepage", () => {
  const v = defaultVoice({ name: "Acme" }, "Founders of small SaaS teams");
  assert.match(v.naming, /"Acme"/);
  assert.equal(v.reader, "Founders of small SaaS teams");
  assert.ok(v.tone.includes("friendly"));
  assert.equal(defaultVoice({ name: "Acme" }).reader.length > 0, true, "a reader even without guidelines");
  const g = guidelinesBody({ name: "Acme", domain: "acme.com" }, { about: "Acme is a CRM software company that helps small teams sell.", offer: ["Acme CRM: pipelines"], reader: "Sales leads", proof: [], words: ["Acme CRM"], cta: "Start free" });
  assert.match(g.body, /^# Acme/);
  assert.match(g.body, /## What we offer\n- Acme CRM: pipelines/);
  assert.ok(!/Proof we can use/.test(g.body), "no empty sections");
  assert.equal(g.reader, "Sales leads");
  assert.match(fallbackGuidelines({ name: "Acme", domain: "acme.com" }), /https:\/\/acme.com/);
});

// ─────────────── the brief's examples and images ───────────────
const research = { sources: [{ n: 1, url: "https://a.com/x", title: "A", domain: "a.com", kind: "serp" as const, position: 1, words: 900 }], questions: [], engines: [] };

test("the brief keeps real examples, gives each a screenshot and drops charts without sources", () => {
  const raw = {
    titles: ["2 Best CRMs"],
    h1: "2 Best CRMs",
    outline: [
      { h2: "1. HubSpot", points: ["Free plan"], h3: [], sources: [1] },
      { h2: "2. Attio", points: ["Startups"], h3: [], sources: [1] },
    ],
    examples: [
      { name: "HubSpot", url: "hubspot.com", kind: "CRM software", opener: "HubSpot is a CRM software company that ...", facts: ["Free plan"], sources: [1, 7] },
      { name: "Attio", url: "javascript:alert(1)", kind: "CRM", opener: "", facts: [], sources: [] },
    ],
    images: [
      { placement: "1. HubSpot", kind: "chart", shows: "Prices", alt: "", url: "", numbers: "Free; $20", sources: [] },
      { placement: "2. Attio", kind: "steps", shows: "Setup in steps", alt: "Setup", url: "", numbers: "", sources: [] },
      { placement: "2. Attio", kind: "screenshot", shows: "Attio's homepage", alt: "Attio", url: "", numbers: "", sources: [] },
    ],
    checks: ["Attio's seat price"],
  };
  const b = cleanBrief(raw, research, [], { model: "m", at: "", keyword: "best crm" });
  assert.deepEqual(b.examples?.map((e) => [e.name, e.url, e.sources]), [["HubSpot", "https://hubspot.com/", [1]]], "a bad address is dropped, unknown sources too");
  assert.deepEqual(
    b.images?.map((m) => [m.placement, m.kind]),
    [
      ["1. HubSpot", "screenshot"],
      ["2. Attio", "steps"],
    ],
    "a chart with no source and a screenshot with no page are dropped; HubSpot gets its screenshot",
  );
  assert.deepEqual(b.checks, ["Attio's seat price"]);
  assert.equal(webUrl("http://10.0.0.1/x"), "", "no IP addresses");
  assert.equal(webUrl("https://user:pw@site.com"), "");
  assert.equal(withExampleShots([], [{ name: "Zapier", url: "https://zapier.com/" }], ["Intro", "3. Zapier"])[0].placement, "3. Zapier");
});

test("examples' own pages are read and added to the sources, and a page that fails is kept with its error", async () => {
  const b = { examples: [{ name: "HubSpot", url: "https://hubspot.com/", kind: "CRM", opener: "", facts: [], sources: [1] }, { name: "Down", url: "https://down.com/", kind: "", opener: "", facts: [], sources: [] }], research: { ...research, topPages: "", aiAnswers: "" } } as unknown as WriterBrief;
  const out = await readExamples(b, async (url) => (url.includes("down") ? Promise.reject(new Error("timeout")) : { title: "HubSpot", text: "HubSpot is a CRM platform with free tools.", ok: true }));
  assert.equal(out.research.sources.length, 2);
  assert.deepEqual(out.research.sources[1], { n: 2, url: "https://hubspot.com/", title: "HubSpot", domain: "hubspot.com", kind: "example", position: null, words: 8 });
  assert.deepEqual(out.examples?.[0].sources, [1, 2]);
  assert.equal(out.examples?.[1].page?.ok, false);
  assert.equal(out.examples?.[1].page?.error, "timeout");
  // The draft reads the example's page as a numbered source.
  const pages = sourcesFor({ ...b, ...out } as WriterBrief, { keyword: "", pages: [], questions: [], aiOverview: "", answers: [] });
  assert.equal(pages[1].body, "HubSpot is a CRM platform with free tools.");
  assert.equal(exampleFor({ examples: [{ name: "HubSpot", url: "", kind: "", opener: "", facts: [], sources: [] }, { name: "HubSpot CRM", url: "", kind: "", opener: "", facts: [], sources: [] }] }, "2. HubSpot CRM")?.name, "HubSpot CRM");
});

// ─────────────── the draft ───────────────
const ctx: WriterContext = { brand: { name: "Acme", domain: "acme.com" }, voice: null, kit: null, guidelines: null, sample: DEFAULT_SAMPLE, sitemap: [] };
const pack: ResearchPack = { keyword: "crm", pages: [{ url: "https://a.com/x", title: "A", domain: "a.com", kind: "serp", position: 1, words: 900, headings: [], body: "HubSpot has a free plan." }], questions: [], aiOverview: "", answers: [] };
const brief: WriterBrief = {
  titles: ["5 Best CRMs"],
  h1: "5 Best CRMs",
  metaDescription: "",
  slug: "best-crms",
  searchIntent: "",
  reader: "",
  angle: "",
  wordTarget: 900,
  outline: [{ h2: "1. HubSpot", points: ["Free plan"], h3: [], sources: [1] }],
  entities: [],
  gaps: [],
  faqs: [],
  internalLinks: [],
  cta: { text: "", where: "" },
  modules: [],
  images: [{ placement: "1. HubSpot", kind: "screenshot", shows: "HubSpot", alt: "HubSpot's homepage", url: "https://hubspot.com/" }],
  examples: [{ name: "HubSpot", url: "https://hubspot.com/", kind: "CRM", opener: "HubSpot is a CRM software company that helps teams sell.", facts: [], sources: [1] }],
  research: { ...research, topPages: "", aiAnswers: "" },
  model: "m",
  at: "",
};
const briefRow: BriefRow = { id: "b1", workspace_id: "w1", brand_id: "br1", site_id: "s1", item_id: "i1", keyword: "crm", research_run_id: "r1", status: "approved", step: "done", brief, notes: "", note: null, version: 1, error: null };
const draftRow = (): DraftRow => ({ id: "d1", workspace_id: "w1", brand_id: "br1", site_id: "s1", item_id: "i1", brief_id: "b1", doc_id: null, status: "generating", step: "sections", version: 1, note: null, sections: [], checked: null, check_at: null, modules: [], period: "2026-10", words: 0, error: null, ready_at: null });

function memory() {
  const db = { row: draftRow(), docs: [] as { id: string; content: Record<string, unknown>; meta: Record<string, unknown> }[] };
  const store: DraftStore = {
    draft: async () => structuredClone(db.row),
    brief: async () => structuredClone(briefRow),
    update: async (_id, patch) => void Object.assign(db.row, structuredClone(patch)),
    saveDoc: async (_d, doc) => {
      db.docs.push({ id: "doc1", content: doc.content, meta: doc.meta });
      return "doc1";
    },
  };
  return { db, store };
}

function deps(calls: Record<string, number>, opts: { fix?: (prompt: string) => unknown; images?: () => ImagesOut; crashFix?: boolean } = {}): DraftDeps {
  const n = (k: string) => (calls[k] = (calls[k] ?? 0) + 1);
  return {
    context: async () => ({ ctx, pack }),
    writeSection: async (_prefix, prompt) => {
      n("section");
      return prompt.includes("Write the intro")
        ? { blocks: [p("If you need a CRM, this list helps you pick one that fits your team and budget this year.")] }
        : { blocks: [p("The blog is good [per A](https://a.com/x). It works."), p("HubSpot has a free plan for small teams that want to start without paying [per A](https://a.com/x).")] };
    },
    styleReview: async () => {
      n("review");
      return { findings: [{ id: "1.0.0", rule: "kind", why: "a verdict" }] };
    },
    styleFix: async (_prefix, prompt) => {
      n("fix");
      if (opts.crashFix && calls.fix === 1) throw new Error("killed");
      return opts.fix ? opts.fix(prompt) : { blocks: [p("HubSpot is a CRM software company that helps teams sell, and its blog explains how [per A](https://a.com/x)."), p("HubSpot has a free plan for small teams that want to start without paying [per A](https://a.com/x).")] };
    },
    check: async () => {
      n("check");
      return { cut: [] };
    },
    images: async () => {
      n("images");
      return opts.images ? opts.images() : { state: "done", placed: [{ placement: "1. HubSpot", kind: "screenshot", src: "https://cdn/x.jpg", alt: "HubSpot's homepage", width: 1600, height: 1000 }], missing: [], featured: { placement: "featured", kind: "featured", src: "https://cdn/f.png", alt: "5 Best CRMs", width: 1600, height: 840 } };
    },
    buildModule: async () => ({ html: "" }),
    model: "m",
  };
}

test("the draft runs the style passes, then the check, then images, and the doc gets the fixed text, images and title", async () => {
  const calls: Record<string, number> = {};
  const { db, store } = memory();
  const out = await runDraft(store, deps(calls), "d1", 1);
  assert.deepEqual(out, { state: "done" });
  assert.equal(calls.review, 1);
  assert.equal(calls.fix, 1, "only the section with findings is rewritten");
  assert.equal(db.row.styled?.done, true);
  assert.match(JSON.stringify(db.row.checked?.sections), /HubSpot is a CRM software company/, "the check runs on the fixed text");
  const content = (db.docs[0].content as { content: { type: string; attrs?: Record<string, unknown> }[] }).content;
  const at = content.findIndex((x) => x.type === "image");
  assert.equal(content[at - 1].type, "paragraph", "the screenshot sits after the section's first paragraph");
  assert.equal(content[at].attrs?.src, "https://cdn/x.jpg");
  assert.equal(db.docs[0].meta.image, "https://cdn/f.png", "the featured image goes to Publish");
  assert.equal(db.row.styled?.title, "1 Best CRMs", "the title count follows the article");
  assert.ok(!content.some((x) => x.type === "note"), "no image notes when the images were made");
});

test("a killed fix restarts at that section, and a fix that changes a fact keeps the old text", async () => {
  const calls: Record<string, number> = {};
  const { db, store } = memory();
  await assert.rejects(runDraft(store, deps(calls, { crashFix: true }), "d1", 1), /killed/);
  assert.equal(calls.review, 1);
  assert.equal(db.row.styled?.next, 1, "the fixes stopped at the second section");
  await runDraft(store, deps(calls), "d1", 1);
  assert.equal(calls.review, 1, "the review isn't paid twice");
  assert.equal(calls.fix, 2);

  const calls2: Record<string, number> = {};
  const two = memory();
  await runDraft(two.store, deps(calls2, { fix: () => ({ blocks: [p("HubSpot has a free plan for 2 teams.")] }) }), "d1", 1);
  assert.match(JSON.stringify(two.db.row.styled?.sections), /The blog is good/, "the rewrite lost a link, so the old text stays");
  assert.ok((two.db.row.styled?.left ?? []).length > 0, "what's left is listed for a person");
});

test("while the worker makes images the draft waits without paying, and missing images become notes", async () => {
  const calls: Record<string, number> = {};
  const { db, store } = memory();
  let ready = false;
  const images = (): ImagesOut => (ready ? { state: "done", placed: [], missing: [{ placement: "1. HubSpot", kind: "screenshot", shows: "HubSpot", url: "https://hubspot.com/", reason: "The page blocked the screenshot." }], featured: null } : { state: "wait", why: "images" });
  const first = await runDraft(store, deps(calls, { images }), "d1", 1);
  assert.equal(first.state, "wait");
  const paid = calls.section + calls.review + calls.fix + calls.check;
  await runDraft(store, deps(calls, { images }), "d1", 1);
  assert.equal(calls.section + calls.review + calls.fix + calls.check, paid, "waiting pays nothing");
  ready = true;
  assert.deepEqual(await runDraft(store, deps(calls, { images }), "d1", 1), { state: "done" });
  const notes = (db.docs[0].content as { content: { type: string; content?: { text: string }[] }[] }).content.filter((x) => x.type === "note");
  assert.equal(notes.length, 1);
  assert.match(notes[0].content![0].text, /^Add screenshot: HubSpot \(https:\/\/hubspot.com\/\)\. The page blocked/);
});

test("older briefs without image kinds keep their image notes", () => {
  const old = { ...brief, images: [{ placement: "1. HubSpot", shows: "A chart", alt: "" }] };
  const doc = buildDoc(old, [{ key: "h2-0", h2: "1. HubSpot", blocks: [p("Text here.")] }], [], { placed: [], missing: [], featured: null });
  assert.deepEqual(
    (doc.content.content as { type: string }[]).map((x) => x.type),
    ["heading", "paragraph", "note"],
  );
});
