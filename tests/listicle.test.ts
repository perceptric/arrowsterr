import { test } from "node:test";
import assert from "node:assert/strict";
import { listicleRules, listicleSlug, planSlug, plural } from "../src/lib/listicle.ts";

test("nouns go plural the way English does, and mass nouns stay", () => {
  assert.deepEqual(["agency", "service", "coach", "box", "consultant", "services", "class", "seo", "marketing", "2026"].map(plural), ["agencies", "services", "coaches", "boxes", "consultants", "services", "classes", "seo", "marketing", "2026"]);
});

test("bottom-of-funnel keywords get a best- listicle slug with the right noun made plural", () => {
  assert.equal(listicleSlug("seo agency"), "best-seo-agencies");
  assert.equal(listicleSlug("ai seo agency"), "best-ai-seo-agencies");
  assert.equal(listicleSlug("enterprise seo services"), "best-enterprise-seo-services");
  assert.equal(listicleSlug("seo consultant for small business"), "best-seo-consultants-for-small-business");
  assert.equal(listicleSlug("digital marketing agency for startups"), "best-digital-marketing-agencies-for-startups");
  assert.equal(listicleSlug("affordable seo packages"), "best-affordable-seo-packages");
  assert.equal(listicleSlug("seo for financial advisors"), "best-seo-for-financial-advisors");
  assert.equal(listicleSlug("b2b lead generation agency"), "best-b2b-lead-generation-agencies");
  assert.equal(listicleSlug("answer engine optimization services"), "best-answer-engine-optimization-services");
});

test("keywords that already rank or compare keep their words", () => {
  assert.equal(listicleSlug("best crm for startups"), "best-crm-for-startups");
  assert.equal(listicleSlug("top seo tools"), "top-seo-tools");
  assert.equal(listicleSlug("ahrefs vs semrush"), "ahrefs-vs-semrush");
  assert.equal(listicleSlug("semrush alternatives"), "semrush-alternatives");
  assert.equal(listicleSlug(""), "");
});

test("the Content Plan suggests a listicle slug only for bottom-of-funnel keywords", () => {
  assert.equal(planSlug("seo agency", "bofu"), "best-seo-agencies");
  assert.equal(planSlug("what is seo", "tofu"), "what-is-seo");
  assert.equal(planSlug("seo agency", null), "seo-agency");
});

test("the brief's listicle rules follow the best comparison pages: overview, table, one shape per option, how to choose", () => {
  const r = listicleRules("seo agency", 2026, "Acme");
  assert.match(r, /N Best Seo Agency in 2026/);
  assert.match(r, /Best Seo Agency: Quick Overview/);
  assert.match(r, /comparison table/);
  assert.match(r, /"1\. \[Name\]: Best for \[use case\]"/);
  assert.match(r, /"Overview", "Pros", "Cons", "Pricing"/);
  assert.match(r, /How to Choose the Right Seo Agency/);
  assert.match(r, /Acme goes in the list as option 1/);
  assert.match(r, /slug: "best-seo-agencies"/);
});

test("list keywords are listicles whatever their stage, and the listicle's fixed headings are known", async () => {
  const { isListicle, skeletonHeading } = await import("../src/lib/listicle.ts");
  assert.equal(isListicle("freshdesk alternatives", "tofu"), true);
  assert.equal(isListicle("zendesk vs freshdesk", null), true);
  assert.equal(isListicle("what is agentic ai", "tofu"), false);
  assert.equal(isListicle("seo agency", "bofu"), true);
  for (const h of ["Best Freshdesk Alternatives: Quick Overview", "6 Best Freshdesk Alternatives Compared", "1. Zendesk: Best for large teams", "How to Choose the Right Freshdesk Alternative"]) assert.equal(skeletonHeading(h), true, h);
  assert.equal(skeletonHeading("What is agentic AI?"), false);
});

test("a BOFU brief's slug is the listicle slug, whatever came back; other briefs keep theirs", async () => {
  const { cleanBrief } = await import("../src/lib/writerBrief.ts");
  const raw = { h1: "SEO Agencies", slug: "seo-agency-guide", outline: [{ h2: "One", points: [], h3: [], sources: [] }] };
  const research = { sources: [], questions: [], engines: [] };
  assert.equal(cleanBrief(raw, research, [], { model: "m", at: "", keyword: "seo agency", stage: "bofu" }).slug, "best-seo-agencies");
  assert.equal(cleanBrief(raw, research, [], { model: "m", at: "", keyword: "seo agency", stage: "mofu" }).slug, "seo-agency-guide");
  assert.equal(cleanBrief(raw, research, [], { model: "m", at: "", keyword: "seo agency" }).slug, "seo-agency-guide");
});
