import { test } from "node:test";
import assert from "node:assert/strict";
import { statusChoice, statusPatch, workflowStep } from "../src/lib/library.ts";
import { editBrief, type WriterBrief } from "../src/lib/writerBrief.ts";

test("the deep dive's steps follow the Editorial Calendar status", () => {
  assert.equal(workflowStep("planned"), "planned");
  assert.equal(workflowStep("brief"), "brief");
  assert.equal(workflowStep("writing"), "draft");
  assert.equal(workflowStep("review"), "review");
  assert.equal(workflowStep("published"), "published");
});

const brief: WriterBrief = {
  titles: ["7 Semrush Alternatives"],
  h1: "7 Semrush Alternatives",
  metaDescription: "Compare",
  slug: "semrush-alternatives",
  searchIntent: "Compare tools",
  reader: "SEO lead",
  angle: "Real prices",
  wordTarget: 2000,
  outline: [{ h2: "Why switch", points: ["Price"], h3: [], sources: [1, 2] }],
  entities: ["Ahrefs"],
  gaps: ["No prices"],
  faqs: [{ question: "Is there a free one?", answer: "Yes" }],
  internalLinks: [{ url: "https://a.com/x", anchor: "x", where: "intro" }],
  cta: { text: "Try it", where: "end" },
  modules: [],
  research: { topPages: "", aiAnswers: "", sources: [{ n: 1, url: "https://a.com", title: "A", domain: "a.com", kind: "serp", position: 1, words: 100 }, { n: 2, url: "https://b.com", title: "B", domain: "b.com", kind: "ai", position: null, words: 50 }], questions: [], engines: [] },
  model: "m",
  at: "2026-10-18T00:00:00Z",
};

test("editing a brief changes the plan and keeps the research, links and modules", () => {
  const next = editBrief(brief, {
    h1: "New title",
    slug: "/new-slug",
    wordTarget: "2500",
    outline: [{ h2: "Pricing", points: ["Plans", 7], h3: [{ title: "Free tiers", points: ["One"] }], sources: [2, 9] }, { h2: "Verdict", points: [] }],
    faqs: [{ question: "Q", answer: "A" }, { question: "  ", answer: "dropped" }],
    research: { sources: [] },
    internalLinks: [],
  });
  assert.equal(next.h1, "New title");
  assert.equal(next.slug, "new-slug");
  assert.equal(next.wordTarget, 2500);
  assert.deepEqual(next.outline[0], { h2: "Pricing", points: ["Plans"], h3: [{ title: "Free tiers", points: ["One"] }], sources: [2] });
  assert.deepEqual(next.outline[1].sources, []);
  assert.deepEqual(next.faqs, [{ question: "Q", answer: "A" }]);
  assert.equal(next.research.sources.length, 2);
  assert.equal(next.internalLinks.length, 1);
  assert.equal(next.metaDescription, "Compare");
});

test("a bad edit keeps the old values", () => {
  assert.deepEqual(editBrief(brief, null), brief);
  const next = editBrief(brief, { h1: 5, wordTarget: -3, outline: "x", faqs: "y", cta: "z" });
  assert.equal(next.h1, brief.h1);
  assert.equal(next.wordTarget, 2000);
  assert.deepEqual(next.outline, brief.outline);
  assert.deepEqual(next.faqs, brief.faqs);
  assert.deepEqual(next.cta, brief.cta);
});

test("the Content status picker reads and changes the same way in the deep dive and the grid", () => {
  assert.equal(statusChoice({ status: "planned", due_date: null }), "idea");
  assert.equal(statusChoice({ status: "planned", due_date: "2026-11-02" }), "planned");
  assert.equal(statusChoice({ status: "writing", due_date: null }), "writing");
  assert.deepEqual(statusPatch("idea", "2026-11-02", "2026-10-26"), { status: "planned", due_date: null });
  assert.deepEqual(statusPatch("planned", null, "2026-10-26"), { status: "planned", due_date: "2026-10-26" });
  assert.deepEqual(statusPatch("planned", "2026-11-02", "2026-10-26"), { status: "planned" });
  assert.deepEqual(statusPatch("review", null, "2026-10-26"), { status: "review" });
});
