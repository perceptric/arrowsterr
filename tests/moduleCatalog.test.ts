import { test } from "node:test";
import assert from "node:assert/strict";
import { kindLabel, kindOf, kindsForPrompt, MODULE_IDS, MODULE_KINDS } from "../src/lib/moduleCatalog.ts";
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

test("every kind says when it helps and how to build it", () => {
  for (const k of MODULE_KINDS) {
    assert.ok(k.when.length > 20 && k.when.length < 120, k.id);
    assert.ok(k.build.length > 80, k.id);
  }
});

test("the brief's prompt lists every kind with when it helps", () => {
  const text = kindsForPrompt();
  for (const k of MODULE_KINDS) assert.ok(text.includes(`${k.id} (${k.label}): ${k.when}`), k.id);
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
