import { test } from "node:test";
import assert from "node:assert/strict";
import { kindLabel, kindOf, kindsForPrompt, MODULE_IDS, MODULE_KINDS, suggestKinds } from "../src/lib/moduleCatalog.ts";
import { MODULE_LABEL, MODULE_TYPES } from "../src/lib/writerBrief.ts";
import { modulePrompt } from "../src/lib/writerModules.ts";

test("the catalog has 13 kinds with unique ids, and the brief accepts each one plus the old ones", () => {
  assert.equal(MODULE_KINDS.length, 13);
  assert.equal(new Set(MODULE_KINDS.map((k) => k.id)).size, 13);
  for (const id of [...MODULE_KINDS.map((k) => k.id), "roi", "diagram"]) assert.ok(MODULE_TYPES.includes(id), id);
  assert.equal(MODULE_LABEL.pyramid, "Layered pyramid");
  assert.equal(kindLabel("roi"), "ROI estimator");
  assert.equal(kindOf("nope"), null);
  assert.deepEqual(MODULE_IDS.slice(0, 3), ["table", "timeline", "pyramid"]);
});

test("every kind says when it helps and how to build it, and its picture is a closed SVG with no script", () => {
  for (const k of MODULE_KINDS) {
    assert.ok(k.when.length > 20 && k.when.length < 120, k.id);
    assert.ok(k.build.length > 80, k.id);
    assert.match(k.preview, /^<svg viewBox="0 0 120 72"[^>]*>[\s\S]*<\/svg>$/, k.id);
    assert.doesNotMatch(k.preview, /<script|on\w+=|javascript:/i, k.id);
  }
});

test("the brief's prompt lists every kind with when it helps", () => {
  const text = kindsForPrompt();
  for (const k of MODULE_KINDS) assert.ok(text.includes(`${k.id} (${k.label}): ${k.when}`), k.id);
});

test("a section's words pick the kinds that fit it, with its H2 counting most", () => {
  assert.equal(suggestKinds("How much does an SEO agency cost?", "Retainers run $2,500 a month.")[0], "calculator");
  assert.equal(suggestKinds("The 5 steps to answer a bad review", "First reply, then take it offline.")[0], "timeline");
  assert.equal(suggestKinds("The three layers of your reputation", "")[0], "pyramid");
  assert.equal(suggestKinds("Ahrefs vs Semrush", "")[0], "comparison");
  assert.equal(suggestKinds("Which plan is right for you?", "")[0], "quiz");
  assert.equal(suggestKinds("Effort and impact", "Prioritize the quick wins.")[0], "matrix");
  assert.equal(suggestKinds("From visitors to leads", "Your conversion funnel.")[0], "funnel");
  assert.deepEqual(suggestKinds("Why it matters", "Some words here."), ["table", "timeline", "checklist"]);
  assert.deepEqual(suggestKinds("Pricing", "cost price budget"), ["calculator", "table", "timeline"]);
  assert.equal(suggestKinds("Ahrefs vs Semrush", "", 2).length, 2);
});

test("the build prompt carries the kind's design, and old kinds still build", () => {
  const base = { title: "Reputation layers", purpose: "Show the layers", placement: "Layers", inputs: [], outputs: [], data: "", why: "" };
  const p = modulePrompt({ ...base, type: "pyramid" }, { keyword: "reviews", brand: "Acme", section: "Text" });
  assert.match(p, /Module: Layered pyramid: Reputation layers/);
  assert.match(p, /How to build it: A 3D pyramid drawn in inline SVG/);
  const old = modulePrompt({ ...base, type: "roi" }, { keyword: "reviews", brand: "Acme", section: "Text" });
  assert.match(old, /Module: ROI estimator/);
  assert.doesNotMatch(old, /How to build it/);
});
