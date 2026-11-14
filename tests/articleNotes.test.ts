import { test } from "node:test";
import assert from "node:assert/strict";
import { cardProblems, cardsFrom, cleanCards, cleanNotes, numbersOf, visualsOf, type FactNote } from "../src/lib/articleNotes.ts";
import { editBrief, runBrief, type BriefDeps, type BriefRow, type BriefStore, type ResearchPack, type WriterBrief } from "../src/lib/writerBrief.ts";
import { planSections, sectionPrompt } from "../src/lib/writerDraft.ts";

// Draft and Write, Phase 1: fact notes and section cards (docs/draft-and-write-build.md).

const body = "HubSpot has a free plan for up to 2 users. Pipedrive starts at $14 a month per seat, billed yearly.";
const sources = [{ n: 1, url: "https://a.com/crm", body }];

test("a note is kept only when its quote is on its page and every number in the fact is in the quote", () => {
  const out = cleanNotes(
    {
      notes: [
        { source: 1, quote: "Pipedrive starts at $14 a month per seat", fact: "Pipedrive costs $14 a month per seat." },
        // One word off: "begins" isn't on the page.
        { source: 1, quote: "Pipedrive begins at $14 a month per seat", fact: "Pipedrive costs $14 a month." },
        // The fact says 3 users; the quote says 2.
        { source: 1, quote: "HubSpot has a free plan for up to 2 users.", fact: "HubSpot is free for 3 users." },
        // No such source.
        { source: 4, quote: "HubSpot has a free plan for up to 2 users.", fact: "HubSpot is free for 2 users." },
        // Curly quotes and extra spaces still match.
        { source: 1, quote: "“HubSpot has a free  plan for up to 2 users.”", fact: "HubSpot is free for up to 2 users." },
        // The same quote twice.
        { source: 1, quote: "HubSpot has a free plan for up to 2 users.", fact: "HubSpot is free for 2 users." },
      ],
    },
    sources,
  );
  assert.deepEqual(
    out.notes.map((n) => [n.id, n.quote]),
    [
      ["n1", "Pipedrive starts at $14 a month per seat"],
      ["n2", "HubSpot has a free  plan for up to 2 users.".replace("  ", " ")],
    ],
  );
  assert.equal(out.dropped, 4);
  assert.deepEqual(numbersOf("It costs $1,200 or 14.0 in 2026."), ["1200", "14", "2026"]);
});

const notes: FactNote[] = [
  { id: "n1", source: 1, quote: "Pipedrive starts at $14 a month per seat", fact: "Pipedrive costs $14 a month per seat.", numbers: ["14"] },
  { id: "n2", source: 1, quote: "HubSpot has a free plan for up to 2 users.", fact: "HubSpot is free for 2 users.", numbers: ["2"] },
];

test("cards keep only real note ids and allowed links, move Detail needed points to gaps and share the words", () => {
  const cards = cleanCards(
    [
      { key: "intro", h2: "", job: "Say who this is for", points: ["Founders pick on cost"], facts: ["n2"], words: 100, links: [], gaps: [] },
      {
        key: "h2-0",
        h2: "The best CRM for startups on a budget",
        job: "Compare the costs",
        points: ["Pipedrive per seat", "Detail needed: Attio's price"],
        facts: ["n1", "n9", "n1"],
        words: 300,
        links: [
          { url: "https://acme.com/pricing/", anchor: "our pricing" },
          { url: "https://evil.com/x", anchor: "x" },
        ],
        gaps: [],
      },
    ],
    { notes, keyword: "crm for startups", wordTarget: 1200, sitemap: ["https://acme.com/pricing"], sources: ["https://a.com/crm"] },
  );
  assert.deepEqual(cards[1].facts, ["n1"]);
  assert.deepEqual(cards[1].points, ["Pipedrive per seat"]);
  assert.deepEqual(cards[1].gaps, ["Attio's price"]);
  assert.deepEqual(cards[1].links, [{ url: "https://acme.com/pricing", anchor: "our pricing" }]);
  assert.equal(cards[1].keyword, true);
  assert.deepEqual(
    cards.map((c) => c.words),
    [300, 900],
  );
  assert.deepEqual(cardProblems(cards, { notes, keyword: "crm for startups", h1: "The best CRM for startups" }), []);
  const bad = cardProblems([{ ...cards[1], job: "", points: [], facts: ["n7"], keyword: false }], { notes, keyword: "crm for startups", h1: "Pick a tool" });
  assert.equal(bad.length, 5);
});

test("an older brief gets plain cards, and chips list the images and modules under each section", () => {
  const cards = cardsFrom({ outline: [{ h2: "Pricing", points: ["Seats"] }], wordTarget: 1600, angle: "Cost", searchIntent: "Compare" });
  assert.deepEqual(
    cards.map((c) => c.key),
    ["intro", "h2-0"],
  );
  const chips = visualsOf({ images: [{ placement: "pricing", shows: "Prices", kind: "chart" }, { placement: "intro", shows: "Hero" }], modules: [{ title: "Cost calculator", placement: "Pricing" }] }, cards[1]);
  assert.deepEqual(chips, [
    { kind: "image", id: "pricing|chart|Prices", label: "Chart" },
    { kind: "module", id: "Cost calculator", label: "Cost calculator" },
  ]);
  assert.deepEqual(
    visualsOf({ images: [{ placement: "intro", shows: "Hero" }], modules: [] }, cards[0]).map((c) => c.label),
    ["Image"],
  );
});

// ─────────────── the brief with notes, end to end ───────────────
const pack: ResearchPack = {
  keyword: "crm for startups",
  pages: [{ url: "https://a.com/crm", title: "CRM guide", domain: "a.com", kind: "serp", position: 1, words: 2000, headings: [], body }],
  questions: [],
  aiOverview: "",
  answers: [],
};
const row: BriefRow = { id: "b1", workspace_id: "w1", brand_id: "br1", site_id: "s1", item_id: "i1", keyword: "crm for startups", research_run_id: "run1", status: "generating", step: "writing", brief: null, notes: "", note: null, version: 1, error: null };
const raw = {
  titles: ["The best CRM for startups"],
  h1: "The best CRM for startups",
  metaDescription: "Pick a CRM.",
  slug: "best-crm-startups",
  searchIntent: "Compare",
  reader: "Founders",
  angle: "Cost over time",
  wordTarget: 1000,
  job: "Pick a CRM this week",
  pov: "Seat price matters more than the free plan",
  leadingWord: "seat math",
  shape: { usual: "Top 10 list", others: ["A cost table", "A decision path"], picked: "A cost table", why: "Readers compare prices" },
  intro: { job: "Name the reader", points: ["Founders count seats"], facts: ["n2"], words: 120, links: [], gaps: [] },
  outline: [
    { h2: "What a CRM for startups costs", points: ["Per seat"], h3: [], sources: [1], job: "Show the costs", facts: ["n1", "n5"], words: 400, links: [], gaps: [] },
    { h2: "How to pick", points: ["Detail needed: a real trial length"], h3: [], sources: [1], job: "Give the steps", facts: [], words: 300, links: [], gaps: [] },
  ],
  entities: [],
  gaps: [],
  faqs: [],
  internalLinks: [],
  cta: { text: "Try Acme", where: "How to pick" },
  modules: [{ type: "calculator", title: "Seat cost calculator", purpose: "Cost", placement: "What a CRM for startups costs", inputs: [], outputs: [], data: "", why: "" }],
  images: [],
  topPages: "",
  aiAnswers: "",
};

async function briefWithNotes(): Promise<WriterBrief> {
  const db = { row: structuredClone(row) };
  const store: BriefStore = { brief: async () => structuredClone(db.row), update: async (_id, patch) => void Object.assign(db.row, patch) };
  const prompts: string[] = [];
  const deps: BriefDeps = {
    startResearch: async () => "run1",
    runStatus: async () => ({ status: "done", error: null }),
    research: async () => pack,
    context: async () => ({ brand: { name: "Acme", domain: "acme.com" }, voice: null, kit: null, guidelines: null, sitemap: [] }),
    notes: async () => ({
      notes: [
        { source: 1, quote: "Pipedrive starts at $14 a month per seat", fact: "Pipedrive costs $14 a month per seat." },
        { source: 1, quote: "HubSpot has a free plan for up to 2 users.", fact: "HubSpot is free for 2 users." },
        { source: 1, quote: "Attio costs $29 a month for every seat", fact: "Attio costs $29." },
      ],
    }),
    write: async (_prefix, prompt) => {
      prompts.push(prompt);
      return raw;
    },
    model: "m",
  };
  assert.deepEqual(await runBrief(store, deps, "b1", 1), { state: "done" });
  assert.match(prompts[0], /n1 \[1\]: Pipedrive costs \$14/);
  assert.doesNotMatch(prompts[0], /Attio/);
  return db.row.brief!;
}

test("the brief keeps the notes that quote their page, and cards that cite only them", async () => {
  const b = await briefWithNotes();
  assert.equal(b.notes!.length, 2);
  assert.equal(b.notesDropped, 1);
  assert.equal(b.job, "Pick a CRM this week");
  assert.equal(b.shape!.picked, "A cost table");
  assert.deepEqual(
    b.cards!.map((c) => [c.key, c.facts, c.gaps]),
    [
      ["intro", ["n2"], []],
      ["h2-0", ["n1"], []],
      ["h2-1", [], ["a real trial length"]],
    ],
  );
  assert.deepEqual(cardProblems(b.cards!, { notes: b.notes!, keyword: "crm for startups", h1: b.h1 }).filter((p) => !p.includes("no points")), []);
  for (const n of b.notes!) assert.ok(body.includes(n.quote), `${n.id} is on its page`);
});

test("each section's prompt lists only its card's notes", async () => {
  const b = await briefWithNotes();
  const plan = planSections(b);
  const i = plan.findIndex((s) => s.key === "h2-0");
  const p = sectionPrompt(plan, i, b, pack.pages, null, null);
  assert.match(p, /n1: Pipedrive costs \$14/);
  assert.doesNotMatch(p, /n2:/);
  assert.match(p, /Use only these facts/);
  const j = plan.findIndex((s) => s.key === "h2-1");
  assert.match(sectionPrompt(plan, j, b, pack.pages, null, null), /No fact notes for this section/);
});

test("outline edits rename a heading everywhere, drop a fact or a module, and never add a fact", async () => {
  const b = await briefWithNotes();
  const next = editBrief(b, { cards: [{ key: "h2-0", h2: "What it costs", facts: ["n1", "n2"], points: ["Per seat", "Yearly billing"] }] });
  assert.equal(next.outline[0].h2, "What it costs");
  assert.equal(next.modules[0].placement, "What it costs");
  const c = next.cards!.find((x) => x.key === "h2-0")!;
  assert.deepEqual(c.facts, ["n1"], "n2 wasn't on this card, so it can't be added");
  assert.deepEqual(c.points, ["Per seat", "Yearly billing"]);
  const fewer = editBrief(next, { cards: [{ key: "h2-0", facts: [] }], removeModules: ["Seat cost calculator"] });
  assert.deepEqual(fewer.cards!.find((x) => x.key === "h2-0")!.facts, []);
  assert.equal(fewer.modules.length, 0);
});

test("the brief schema asks for the intro card before the outline, and a gap drops its Detail needed label", async () => {
  const { BRIEF_NOTES_SCHEMA } = await import("../src/lib/writerBrief.ts");
  const keys = Object.keys(BRIEF_NOTES_SCHEMA.properties);
  assert.ok(keys.indexOf("intro") < keys.indexOf("outline"));
  assert.ok(keys.indexOf("job") < keys.indexOf("titles"));
  const [c] = cleanCards([{ key: "intro", h2: "", job: "j", points: ["p"], facts: [], words: 100, links: [], gaps: ["Detail needed: the 2026 price"] }], { notes, keyword: "x", wordTarget: 100, sitemap: [], sources: [] });
  assert.deepEqual(c.gaps, ["the 2026 price"]);
});
