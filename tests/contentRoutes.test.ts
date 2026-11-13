import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT_ALIASES, CONTENT_SLUGS, contentPageFromPath } from "../src/lib/contentRoutes.ts";

test("content: each page opens at its own address", () => {
  assert.equal(contentPageFromPath("/opportunities"), "opportunities");
  assert.equal(contentPageFromPath("/calendar"), "calendar");
  assert.equal(contentPageFromPath("/drafts/"), "library");
});

test("content: old Content Plan names open Opportunities; the Editorial Calendar opens Calendar", () => {
  for (const p of ["/content-plan", "/topic-bank", "/agentic-research", "/planner"]) assert.equal(contentPageFromPath(p), "opportunities", p);
  for (const p of ["/editorial-calendar", "/content-calendar", "/content-intelligence"]) assert.equal(contentPageFromPath(p), "calendar", p);
});

test("content: /content, the Library and the old Agentic Writer open Drafts; Brand is in Settings now", () => {
  assert.equal(contentPageFromPath("/library"), "library");
  assert.equal(contentPageFromPath("/content"), "library");
  assert.equal(contentPageFromPath("/agentic-writer"), "library");
  assert.equal(contentPageFromPath("/writer"), "library");
  assert.equal(contentPageFromPath("/brand"), null);
});

test("content: an alias never hides a page's own address, and other paths are not ours", () => {
  for (const slug of Object.values(CONTENT_SLUGS)) assert.equal(CONTENT_ALIASES[slug], undefined, slug);
  assert.equal(contentPageFromPath("/prompts"), null);
});
