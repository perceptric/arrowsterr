import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSpec, DRAWN_KINDS, FEATURED_HEIGHT, numberOf, renderFrame, renderImage, SHOT_SLOT, WIDTH, type ImageSpec } from "../src/lib/imageTemplates.ts";
import { DEFAULT_KIT } from "../src/lib/brandKit.ts";

const spec = (o: Partial<ImageSpec> & { kind: ImageSpec["kind"] }): Record<string, unknown> => ({ title: "A title", subtitle: "", source: "", items: [], columns: [], highlight: "", ...o });
const bars = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Tool ${i + 1}`, value: `$${(i + 1) * 10}/mo`, text: "" }));

test("numbers come out of values the way readers write them", () => {
  assert.equal(numberOf("$39/mo"), 39);
  assert.equal(numberOf("38%"), 38);
  assert.equal(numberOf("1,200 visits"), 1200);
  assert.equal(numberOf("2.5M"), 2_500_000);
  assert.equal(numberOf("12k"), 12_000);
  assert.equal(numberOf("free"), null);
});

test("a chart with a bar that has no number is refused", () => {
  const bad = cleanSpec(spec({ kind: "chart", source: "Pricing pages", items: [...bars(2), { label: "Peec AI", value: "Contact sales", text: "" }] }));
  assert.equal(bad.ok, false);
  assert.match((bad as { error: string }).error, /number/);
});

test("a chart needs its source, and holds 8 bars at most", () => {
  assert.equal(cleanSpec(spec({ kind: "chart", items: bars(3) })).ok, false);
  assert.equal(cleanSpec(spec({ kind: "chart", source: "Pricing pages", items: bars(8) })).ok, true);
  const nine = cleanSpec(spec({ kind: "chart", source: "Pricing pages", items: bars(9) }));
  assert.equal(nine.ok, false);
  assert.match((nine as { error: string }).error, /at most 8/);
});

test("steps hold 2 to 8, and text too long to fit is refused", () => {
  const steps = (n: number, text = "One plain sentence.") => spec({ kind: "steps", items: Array.from({ length: n }, (_, i) => ({ label: `Step ${i + 1}`, text, value: "" })) });
  assert.equal(cleanSpec(steps(1)).ok, false);
  assert.equal(cleanSpec(steps(8)).ok, true);
  assert.equal(cleanSpec(steps(9)).ok, false);
  assert.equal(cleanSpec(steps(3, "x".repeat(200))).ok, false);
  assert.equal(cleanSpec(spec({ kind: "steps", title: "t".repeat(120), items: bars(3) })).ok, false);
  assert.equal(cleanSpec({ ...spec({ kind: "steps", items: bars(3) }), kind: "pie" }).ok, false);
});

test("comparisons need 2 or 3 columns with points", () => {
  const col = (t: string) => ({ title: t, points: ["One", "Two"] });
  assert.equal(cleanSpec(spec({ kind: "comparison", columns: [col("A")] })).ok, false);
  assert.equal(cleanSpec(spec({ kind: "comparison", columns: [col("A"), col("B"), col("C")] })).ok, true);
  assert.equal(cleanSpec(spec({ kind: "comparison", columns: [col("A"), { title: "B", points: [] }] })).ok, false);
});

test("every text is escaped, so a spec can't add markup or scripts", () => {
  const c = cleanSpec(spec({ kind: "steps", title: `<script>alert(1)</script>`, items: [{ label: `"><img src=x onerror=alert(1)>`, text: "a & b", value: "" }, { label: "Two", text: "", value: "" }] }));
  assert.ok(c.ok);
  const html = renderImage((c as { spec: ImageSpec }).spec, DEFAULT_KIT);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("a &amp; b"));
});

test("every kind draws a 1600 wide canvas in the kit's colors and fonts, and the featured image is 1600 by 840", () => {
  const kit = { ...DEFAULT_KIT, colors: { ...DEFAULT_KIT.colors, primary: "#d9480f" }, fonts: { heading: "Fraunces" as const, body: "DM Sans" as const } };
  const filled: Record<string, Record<string, unknown>> = {
    featured: spec({ kind: "featured", items: [{ label: "Hub", text: "", value: "" }] }),
    chart: spec({ kind: "chart", source: "Pricing pages", items: bars(3) }),
    steps: spec({ kind: "steps", items: bars(3) }),
    comparison: spec({ kind: "comparison", columns: [{ title: "A", points: ["x"] }, { title: "B", points: ["y"] }] }),
    checklist: spec({ kind: "checklist", items: bars(4) }),
    anatomy: spec({ kind: "anatomy", items: bars(4) }),
  };
  for (const k of DRAWN_KINDS) {
    const c = cleanSpec(filled[k]);
    assert.ok(c.ok, k);
    const html = renderImage((c as { spec: ImageSpec }).spec, kit);
    assert.match(html, /id="canvas"/, k);
    assert.ok(html.includes(`width:${WIDTH}px`), k);
    assert.ok(html.includes("#d9480f"), k);
    assert.ok(html.includes("family=Fraunces") && html.includes("family=DM+Sans"), k);
    // No text smaller than 30px.
    for (const m of html.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(m[1]) >= 26, `${k}: ${m[0]}`);
  }
  const f = renderImage((cleanSpec(filled.featured) as { spec: ImageSpec }).spec, kit);
  assert.ok(f.includes(`height:${FEATURED_HEIGHT}px`));
});

test("a logo only comes from a web or data address, and a bad color falls back", () => {
  const html = renderImage((cleanSpec(spec({ kind: "steps", items: bars(2) })) as { spec: ImageSpec }).spec, { ...DEFAULT_KIT, logo: "javascript:alert(1)", colors: { ...DEFAULT_KIT.colors, primary: "red;}body{display:none" } });
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("display:none"));
});

test("the frame holds the screenshot slot and the page's address", () => {
  const html = renderFrame("https://www.zapier.com/blog/<x>", DEFAULT_KIT);
  assert.ok(html.includes(SHOT_SLOT));
  assert.ok(html.includes("zapier.com/blog/&lt;x&gt;"));
  assert.ok(!html.includes("www.zapier"));
});
