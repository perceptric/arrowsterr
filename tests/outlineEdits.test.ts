import { test } from "node:test";
import assert from "node:assert/strict";
import { editBrief, type WriterBrief } from "../src/lib/writerBrief.ts";

const card = (key: string, h2: string, facts: string[] = []) => ({ key, h2, job: "", points: [`${h2} point`], facts, visual: null, words: 300, links: [], gaps: [] });

const brief = {
  titles: ["Best CRMs"],
  h1: "Best CRMs",
  metaDescription: "",
  slug: "best-crms",
  searchIntent: "",
  reader: "",
  angle: "",
  wordTarget: 1200,
  outline: [
    { h2: "What is a CRM?", points: ["Define it"], h3: [], sources: [1], searches: ["what is a crm"] },
    { h2: "1. HubSpot", points: ["Free plan"], h3: [{ title: "Pricing", points: ["Free"] }, { title: "Pros", points: ["Easy"] }], sources: [1], searches: [] },
    { h2: "2. Pipedrive", points: ["Pipelines"], h3: [], sources: [1], searches: [] },
  ],
  entities: [],
  gaps: [],
  faqs: [],
  internalLinks: [],
  cta: { text: "", where: "" },
  modules: [{ type: "calculator", title: "Seat cost calculator", purpose: "", placement: "2. Pipedrive", inputs: [], outputs: [], data: "", why: "" }],
  images: [
    { placement: "1. HubSpot", kind: "screenshot", shows: "HubSpot", alt: "", url: "https://hubspot.com" },
    { placement: "2. Pipedrive", kind: "screenshot", shows: "Pipedrive", alt: "", url: "https://pipedrive.com" },
    { placement: "intro", kind: "chart", shows: "Market", alt: "" },
  ],
  examples: [
    { name: "HubSpot", url: "https://hubspot.com", kind: "CRM", opener: "", facts: [], sources: [1] },
    { name: "Pipedrive", url: "https://pipedrive.com", kind: "CRM", opener: "", facts: [], sources: [1] },
  ],
  cards: [card("intro", ""), card("h2-0", "What is a CRM?"), card("h2-1", "1. HubSpot", ["n1"]), card("h2-2", "2. Pipedrive", ["n2"])],
  research: { topPages: "", aiAnswers: "", sources: [{ n: 1, url: "https://a.com", title: "A", domain: "a.com", kind: "serp", position: 1, words: 100 }], questions: [], engines: [] },
  model: "m",
  at: "",
} as unknown as WriterBrief;

test("sections move, and their cards, images and modules follow with keys numbered again", () => {
  const next = editBrief(brief, { sections: [{ from: 2 }, { from: 0 }, { from: 1 }] });
  assert.deepEqual(next.outline.map((o) => o.h2), ["2. Pipedrive", "What is a CRM?", "1. HubSpot"]);
  assert.deepEqual(next.cards!.map((c) => `${c.key}:${c.h2}`), ["intro:", "h2-0:2. Pipedrive", "h2-1:What is a CRM?", "h2-2:1. HubSpot"]);
  assert.deepEqual(next.cards![1].facts, ["n2"], "a card keeps its facts when it moves");
  assert.equal(next.modules[0].placement, "2. Pipedrive");
  assert.deepEqual(next.outline[2].h3.map((h) => h.title), ["Pricing", "Pros"], "subheadings stay when not given");
});

test("removing a section drops its images, modules and featured example; a new section gets an empty card", () => {
  const next = editBrief(brief, { sections: [{ from: 0 }, { from: 1 }, { h2: "How to choose a CRM", h3: ["Budget", "Team size"] }] });
  assert.deepEqual(next.outline.map((o) => o.h2), ["What is a CRM?", "1. HubSpot", "How to choose a CRM"]);
  assert.deepEqual(next.outline[2].h3, [{ title: "Budget", points: [] }, { title: "Team size", points: [] }]);
  assert.equal(next.modules.length, 0, "the calculator was under Pipedrive");
  assert.deepEqual(next.images!.map((m) => m.placement), ["1. HubSpot", "intro"]);
  assert.deepEqual(next.examples!.map((e) => e.name), ["HubSpot"]);
  const added = next.cards!.find((c) => c.key === "h2-2")!;
  assert.equal(added.h2, "How to choose a CRM");
  assert.deepEqual(added.facts, []);
});

test("renaming a section and its subheadings keeps each subheading's points, and takes its images along", () => {
  const next = editBrief(brief, { sections: [{ from: 0 }, { from: 1, h2: "1. HubSpot: Best for small teams", h3: ["Pros", "Pricing", "Cons"] }, { from: 2 }] });
  assert.equal(next.outline[1].h2, "1. HubSpot: Best for small teams");
  assert.deepEqual(next.outline[1].h3, [{ title: "Pros", points: ["Easy"] }, { title: "Pricing", points: ["Free"] }, { title: "Cons", points: [] }]);
  assert.equal(next.images![0].placement, "1. HubSpot: Best for small teams");
  assert.equal(next.cards!.find((c) => c.key === "h2-1")!.h2, "1. HubSpot: Best for small teams");
  assert.deepEqual(next.examples!.map((e) => e.name), ["HubSpot", "Pipedrive"], "the renamed section still names HubSpot");
});

test("a section can't be kept twice, a new one needs a heading, and an empty list changes nothing", () => {
  const next = editBrief(brief, { sections: [{ from: 1 }, { from: 1 }, { h2: "  " }, { from: 9 }] });
  assert.deepEqual(next.outline.map((o) => o.h2), ["1. HubSpot"]);
  assert.equal(editBrief(brief, { sections: [] }).outline.length, 3);
});
