import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOCK_KINDS, blockProblems, buildBlock, chartScale, cleanSpec, DEFAULT_SPEC, readBlock, sampleSize, themedBlock } from "../src/lib/blockTemplates.ts";
import { DEFAULT_KIT } from "../src/lib/brandKit.ts";

const filled = {
  calculator: DEFAULT_SPEC.calculator,
  sample: DEFAULT_SPEC.sample,
  faq: { items: [{ q: "Can NPS be negative?", a: "Yes. The lowest score is -100." }] },
  chart: { title: "NPS by month", prefix: "", suffix: "", rows: [{ label: "Jun", value: 18 }, { label: "Jul", value: 22 }, { label: "Aug", value: -5 }], note: "" },
  scale: DEFAULT_SPEC.scale,
  checklist: { title: "Before you send", items: ["Same wording everywhere", "Tag each response"] },
};

test("every block builds, carries its spec and reads back the same", () => {
  for (const kind of BLOCK_KINDS) {
    const html = buildBlock(kind, filled[kind]);
    assert.match(html, new RegExp(`^<div [^>]*data-aw-block="${kind}"`), kind);
    assert.match(html, /data-aw-h="\d{3,4}"/, kind);
    assert.ok(!/<script[^>]+src=/i.test(html), `${kind} loads no outside script`);
    assert.ok(!/fetch\(|XMLHttpRequest/.test(html), `${kind} makes no network calls`);
    const back = readBlock(html);
    assert.equal(back?.kind, kind);
    assert.deepEqual(back?.spec, cleanSpec(kind, filled[kind]));
  }
});

test("a theme goes inside the root, so the block still reads back", () => {
  const html = themedBlock("checklist", filled.checklist, DEFAULT_KIT);
  assert.match(html, /^<div class="awb awb-checklist" data-aw-block="checklist"[^>]*><style>:root\{--aw-primary:/);
  assert.equal(readBlock(html)?.kind, "checklist");
});

test("text is escaped and specs are kept in bounds", () => {
  const html = buildBlock("faq", { items: [{ q: "<img src=x onerror=alert(1)>", a: "a & b" }] });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
  const many = cleanSpec("checklist", { title: "t", items: Array.from({ length: 50 }, (_, i) => `item ${i}`) });
  assert.equal(many.items.length, 20);
  const scale = cleanSpec("scale", { min: 0, max: 10, start: 99, bands: [{ upTo: 4, label: "Low", text: "" }] });
  assert.equal(scale.start, 10);
  assert.equal(scale.bands[0].upTo, 10, "the last range always reaches the top of the scale");
});

test("blocks say what's missing before they can be added", () => {
  assert.deepEqual(blockProblems("faq", cleanSpec("faq", { items: [{ q: "Only a question", a: "" }] })).length > 0, true);
  assert.deepEqual(blockProblems("chart", cleanSpec("chart", { title: "x", rows: [{ label: "a", value: 1 }] })).length > 0, true);
  assert.deepEqual(blockProblems("checklist", cleanSpec("checklist", filled.checklist)), []);
});

test("sample size matches the usual formula", () => {
  assert.equal(sampleSize(5000, 5), 357);
  assert.equal(sampleSize(2000, 5), 323);
  assert.equal(sampleSize(100, 5), 80);
  assert.equal(sampleSize(10, 3), 10);
});

test("the chart scale starts at zero or below and ends on a round step", () => {
  assert.deepEqual(chartScale([18, 22, 35]), { lo: 0, hi: 40, step: 10 });
  const neg = chartScale([-12, 30]);
  assert.ok(neg.lo <= -12 && neg.hi >= 30);
  assert.equal(Math.abs(neg.lo % neg.step), 0);
});

test("other embeds are not read as blocks", () => {
  assert.equal(readBlock('<div class="x">hi</div>'), null);
  assert.equal(readBlock('<div data-aw-block="nope" data-aw-spec="%7B%7D"></div>'), null);
});
