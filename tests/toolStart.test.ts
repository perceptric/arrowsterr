import { test } from "node:test";
import assert from "node:assert/strict";
import { instrument, ROUTE, TOOL_ORDER, TOOLS } from "../src/lib/toolStart.ts";

test("every tool start page has the parts its layout needs", () => {
  assert.equal(TOOL_ORDER.length, 6);
  for (const k of TOOL_ORDER) {
    const t = TOOLS[k];
    assert.equal(t.parts.length, 4, `${k} parts`);
    assert.equal(t.facts.length, 4, `${k} facts`);
    assert.equal(t.steps.length, ROUTE.length, `${k} steps`);
    assert.equal(t.terms.length, 6, `${k} terms`);
    assert.ok(t.faq.length >= 4, `${k} questions`);
    assert.ok(t.ask.length >= 1, `${k} Zippie prompts`);
    assert.match(t.slug, /^\/[a-z-]+$/);
  }
});

test("start page copy follows the house rules", () => {
  for (const k of TOOL_ORDER) {
    const words = JSON.stringify(TOOLS[k]);
    assert.doesNotMatch(words, /—|–(?!\d)/, `${k}: no em dashes`);
    assert.doesNotMatch(words, /!/, `${k}: no exclamation marks`);
  }
});

test("each drawing is plain SVG with real numbers", () => {
  for (const k of TOOL_ORDER) {
    const svg = instrument(k);
    assert.ok(svg.length > 500, `${k} draws something`);
    assert.doesNotMatch(svg, /NaN|undefined|<script/i, `${k} is clean`);
  }
});

test("tool screens show their numbers in a stat strip, never a row of equal boxes", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["BacklinksPage", "LinkBuildingPage", "ContentMapPage", "LocalResearchPage"]) {
    const src = readFileSync(new URL(`../src/components/${f}.tsx`, import.meta.url), "utf8");
    assert.match(src, /<StatStrip/, `${f} uses StatStrip`);
    assert.doesNotMatch(src, /function (Kpi|Stat)\(/, `${f} has no local stat box`);
  }
});
