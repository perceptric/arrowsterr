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

test("a module follows the brand: its colors, fonts, corners and guidelines go in the prompt, and its fonts load", async () => {
  const { DEFAULT_KIT } = await import("../src/lib/brandKit.ts");
  const { moduleFonts, moduleStyle, moduleTheme } = await import("../src/lib/writerModules.ts");
  const kit = { ...DEFAULT_KIT, colors: { ...DEFAULT_KIT.colors, primary: "#D73E33" }, fonts: { heading: "DM Sans" as const, body: "Inter" as const }, radius: 10 };
  const style = moduleStyle(kit, { body: "Buttons are pill shaped. Charts use the primary red." });
  assert.match(style, /primary #D73E33 \(buttons/);
  assert.match(style, /DM Sans for headings and Inter for text/);
  assert.match(style, /Corners: 10px/);
  assert.match(style, /Buttons are pill shaped/);
  assert.equal(moduleFonts(kit), "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');");
  assert.ok(moduleTheme(kit).startsWith("@import url('https://fonts.googleapis.com/"));
  assert.match(moduleTheme(kit), /--aw-primary:#D73E33/);
  assert.equal(moduleFonts(null), "");
  assert.equal(moduleStyle(null, null), "");
  const base = { title: "Compare", purpose: "Pick", placement: "Tools", inputs: [], outputs: [], data: "", why: "" };
  assert.match(modulePrompt({ ...base, type: "comparison" }, { keyword: "k", brand: "Acme", section: "s", style }), /Acme's style guide\. The module must look like it belongs on Acme's own site:\n.*primary #D73E33/);
});

test("the brief asks for modules only where they earn their place, and the writer puts lists in lists", async () => {
  const { briefPrompt } = await import("../src/lib/writerBrief.ts");
  const { sectionPrompt, planSections, imageNotes, buildDoc } = await import("../src/lib/writerDraft.ts");
  const ctx = { brand: { name: "Acme", domain: "acme.com" }, voice: null, kit: null, guidelines: null, sitemap: [] };
  const p = briefPrompt({ keyword: "seo agency", notes: "", note: null }, ctx, 5);
  assert.match(p, /Most articles need none or one; never more than two/);
  assert.match(p, /images: 2 to 5 places an image helps/);
  const brief = { titles: ["T"], h1: "T", metaDescription: "", slug: "t", searchIntent: "", reader: "", angle: "", wordTarget: 1200, outline: [{ h2: "Pricing", points: ["Plans"], h3: [], sources: [] }], entities: [], gaps: [], faqs: [], internalLinks: [], cta: { text: "", where: "" }, modules: [], images: [{ placement: "Pricing", shows: "A chart of plan prices.", alt: "Plan prices" }, { placement: "intro", shows: "A hero diagram.", alt: "" }], research: { topPages: "", aiAnswers: "", sources: [], questions: [], engines: [] }, model: "m", at: "" };
  const sp = sectionPrompt(planSections(brief), 1, brief, [], null, null);
  assert.match(sp, /three or more parallel things .* put them in a ul block/);
  assert.match(sp, /steps in order and rankings go in an ol block/);
  assert.deepEqual(imageNotes(brief, "pricing"), [{ type: "note", content: [{ type: "text", text: "Image: A chart of plan prices. Alt: Plan prices" }] }]);
  assert.equal(imageNotes(brief, "").length, 1);
  const doc = buildDoc(brief, [{ key: "intro", h2: "", blocks: [{ type: "p", text: "Hi.", items: [], rows: [] }] }, { key: "h2-0", h2: "Pricing", blocks: [{ type: "p", text: "From $9.", items: [], rows: [] }] }], []);
  const types = (doc.content.content as { type: string }[]).map((n) => n.type);
  assert.deepEqual(types, ["paragraph", "note", "heading", "paragraph", "note"]);
});

test("for a CMS other than WordPress, modules go out as self-contained sandboxed frames and broken ones are dropped", async () => {
  const { framedModules, moduleBlock } = await import("../src/lib/wpModules.ts");
  const block = moduleBlock({ id: "calc-1", title: "Cost calculator", html: "<div><button>Go</button><script>1</script></div>" });
  const out = framedModules(`<p>Before</p>${block}<p>After</p>`);
  assert.match(out, /^<p>Before<\/p><div class="arrowsterr-module"><iframe title="Cost calculator" sandbox="allow-scripts" loading="lazy" style="width:100%;border:0;height:600px" srcdoc="/);
  assert.match(out, /&lt;button&gt;Go&lt;\/button&gt;/);
  assert.match(out, /<p>After<\/p>$/);
  const embed = `<div data-embed="${encodeURIComponent("<b>hi</b>")}"></div>`;
  assert.match(framedModules(embed), /srcdoc=".*&lt;b&gt;hi&lt;\/b&gt;/);
  assert.equal(framedModules('<div data-aw-module="bad id" data-aw-src="x"></div><p>x</p>'), "<p>x</p>");
  assert.equal(framedModules('<div class="x"></div>'), '<div class="x"></div>');
});
