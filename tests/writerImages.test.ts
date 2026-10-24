import { test } from "node:test";
import assert from "node:assert/strict";
import { imageNodes, imagePath, imagesResult, imageTasks, missingNote, planRenders, specPrompt, unsupportedNumbers, WAIT_MS, type ImageRow } from "../src/lib/writerImages.ts";
import type { BriefImage } from "../src/lib/writerImageTypes.ts";
import type { ImageSpec } from "../src/lib/imageTemplates.ts";

const images: BriefImage[] = [
  { placement: "intro", shows: "An old note", alt: "" },
  { placement: "Pricing", shows: "Monthly prices", alt: "Prices", kind: "chart", numbers: "$39, $99" },
  { placement: "Ahrefs", shows: "Ahrefs homepage", alt: "Ahrefs", kind: "screenshot", url: "https://ahrefs.com/" },
  { placement: "Pricing", shows: "A second featured", alt: "", kind: "featured" },
  { placement: "How to pick", shows: "Steps", alt: "Steps", kind: "steps" },
];
const brief = { h1: "Best SEO tools", images };
const article = {
  title: "Best SEO tools",
  sections: [
    { h2: "intro", text: "Here are the tools." },
    { h2: "Pricing", text: "Arrowsterr costs $39 a month and Peec AI costs $99 a month." },
    { h2: "How to pick", text: "Pick by budget." },
  ],
};

test("tasks: the featured image is n 0, brief images keep their place, notes and a second featured are skipped", () => {
  const t = imageTasks(brief);
  assert.deepEqual(t.map((x) => [x.n, x.kind]), [[0, "featured"], [2, "chart"], [3, "screenshot"], [5, "steps"]]);
  assert.deepEqual(imageTasks(brief), t, "the same brief gives the same numbers every time");
  assert.equal(t[2].url, "https://ahrefs.com/");
});

test("tasks stay at 12 at most", () => {
  const many = Array.from({ length: 20 }, (_, i): BriefImage => ({ placement: "Pricing", shows: `x${i}`, alt: "", kind: "steps" }));
  assert.equal(imageTasks({ h1: "T", images: many }).length, 12);
});

test("the spec prompt lists only drawn images, with their numbers", () => {
  const p = specPrompt(imageTasks(brief), article);
  assert.match(p, /n 2: chart, under "Pricing"/);
  assert.match(p, /Numbers: \$39, \$99/);
  assert.ok(!/n 3:/.test(p), "screenshots need no spec");
  assert.match(p, /n 0: featured, the top of the post/);
});

const chart = (values: string[]): ImageSpec => ({ kind: "chart", title: "Prices", subtitle: "", source: "Pricing pages", items: values.map((v, i) => ({ label: `T${i}`, value: v, text: "" })), columns: [], highlight: "" });

test("a number the article doesn't have is caught; numbers it has pass", () => {
  assert.deepEqual(unsupportedNumbers(chart(["$39/mo", "$99/mo"]), article.sections[1].text), []);
  assert.deepEqual(unsupportedNumbers(chart(["$39/mo", "$149/mo"]), article.sections[1].text), ["149"]);
  const steps: ImageSpec = { kind: "steps", title: "Three steps", subtitle: "", source: "", items: [{ label: "Step 1", text: "Save 45% on day one", value: "" }], columns: [], highlight: "" };
  assert.deepEqual(unsupportedNumbers(steps, "no numbers"), ["45"]);
});

test("planRenders: invented numbers and bad specs become notes, the featured image is always made, screenshots get a frame", () => {
  const raw = {
    specs: [
      { n: 2, ...chart(["$39/mo", "$149/mo"]) },
      { n: 5, kind: "steps", title: "Pick", subtitle: "", source: "", items: [{ label: "Only one", text: "", value: "" }], columns: [], highlight: "" },
    ],
  };
  const { renders, missing } = planRenders(imageTasks(brief), raw, article, null);
  assert.deepEqual(renders.map((r) => [r.n, r.kind]), [[0, "featured"], [3, "screenshot"]]);
  assert.ok(renders[0].html.includes("Best SEO tools"));
  assert.ok(renders[1].html.includes("__SHOT__") && renders[1].url === "https://ahrefs.com/");
  assert.deepEqual(missing.map((m) => m.n), [2, 5]);
  assert.match(missing[0].reason, /149/);
  assert.match(missing[1].reason, /at least 2/);
});

test("planRenders: a chart turned into steps when the text has no numbers is kept", () => {
  const raw = { specs: [{ n: 2, kind: "steps", title: "Pricing", subtitle: "", source: "", items: [{ label: "A", text: "", value: "" }, { label: "B", text: "", value: "" }], columns: [], highlight: "" }] };
  const { renders } = planRenders(imageTasks(brief), raw, article, null);
  assert.ok(renders.some((r) => r.n === 2 && r.kind === "steps"));
});

const row = (n: number, status: ImageRow["status"], at: string, extra: Partial<ImageRow> = {}): ImageRow => ({ n, kind: "chart", status, public_url: null, width: null, height: null, error: null, created_at: at, ...extra });

test("imagesResult waits while images are being made, then times out the rest as notes", () => {
  const tasks = imageTasks(brief);
  const t0 = Date.parse("2026-10-24T09:00:00Z");
  const at = new Date(t0).toISOString();
  const rows = [
    row(0, "done", at, { kind: "featured", public_url: "https://x/0.png", width: 1600, height: 840 }),
    row(2, "done", at, { public_url: "https://x/2.png", width: 1600, height: 700 }),
    row(3, "working", at, { kind: "screenshot" }),
    row(5, "failed", at, { kind: "steps", error: "No spec came back for this image." }),
  ];
  const early = imagesResult(tasks, rows, t0 + 60_000);
  assert.equal(early.state, "wait");
  const late = imagesResult(tasks, rows, t0 + WAIT_MS + 1);
  assert.equal(late.state, "done");
  if (late.state !== "done") return;
  assert.equal(late.featured?.src, "https://x/0.png");
  assert.deepEqual(late.placed.map((p) => [p.placement, p.src, p.height]), [["Pricing", "https://x/2.png", 700]]);
  assert.deepEqual(late.missing.map((m) => [m.placement, m.kind]), [["Ahrefs", "screenshot"], ["How to pick", "steps"]]);
  assert.match(late.missing[0].reason, /too long/);
  assert.equal(late.missing[0].url, "https://ahrefs.com/");
});

test("imagesResult is done at once when nothing is left to make", () => {
  const tasks = imageTasks({ h1: "T", images: [] });
  const out = imagesResult(tasks, [row(0, "failed", new Date().toISOString(), { kind: "featured", error: "x" })], Date.now());
  assert.deepEqual(out, { state: "done", placed: [], missing: [], featured: null });
});

test("imageNodes and notes have the editor's shapes; paths are stable", () => {
  const placed = [
    { placement: "Pricing", kind: "chart" as const, src: "https://x/2.png", alt: "Prices", width: 1600, height: 700 },
    { placement: "Other", kind: "steps" as const, src: "https://x/5.png", alt: "Steps", width: 1600, height: 700 },
  ];
  assert.deepEqual(imageNodes(placed, "pricing "), [{ type: "image", attrs: { src: "https://x/2.png", alt: "Prices", title: null } }]);
  assert.equal(imageNodes(placed).length, 2);
  const note = missingNote({ placement: "Ahrefs", kind: "screenshot", shows: "Ahrefs homepage", url: "https://ahrefs.com/", reason: "The page answered 403." });
  assert.equal(note.type, "note");
  assert.match(note.content[0].text, /^Add screenshot: Ahrefs homepage \(https:\/\/ahrefs.com\/\)\. The page answered 403\.$/);
  assert.equal(imagePath("w", "d", 2, 3, "png"), "w/d/2/3.png");
});
