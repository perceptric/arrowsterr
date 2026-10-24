// Agentic Writing images (docs/agentic-writing.md, section 5): which images a draft makes, the one Claude call that
// writes the specs for the drawn ones, and what the draft gets back once the worker has made them.
// Pure: the database, storage and Claude come in from writerImagesServer.ts, so tests run it offline.
import type { BrandKit } from "./brandKit.ts";
import { cleanSpec, DRAWN_KINDS, IMAGE_SPEC_SCHEMA, renderFrame, renderImage, type DrawnKind, type ImageSpec } from "./imageTemplates.ts";
import type { WriterBrief } from "./writerBrief.ts";
import type { ImageKind, ImagesOut, MissingImage, PlacedImage } from "./writerImageTypes.ts";

export const MAX_IMAGES = 12; // the featured image and up to 11 in the article
export const WAIT_MS = 10 * 60_000; // after this, images still being made count as missing, so the draft finishes
export const FEATURED = "featured";

/** One image to make. n is its place in the brief (0 is the featured image), the same every time it is asked for. */
export type ImageTask = { n: number; kind: ImageKind; placement: string; shows: string; alt: string; url?: string; numbers?: string; sources?: number[] };

/**
 * The images a draft makes: the featured image (n 0), then every brief image with a kind, in the brief's order.
 * Older brief images without a kind stay notes in the doc. A second featured image in the list is skipped.
 */
export function imageTasks(brief: Pick<WriterBrief, "h1" | "images">): ImageTask[] {
  const out: ImageTask[] = [{ n: 0, kind: "featured", placement: FEATURED, shows: brief.h1, alt: brief.h1 }];
  (brief.images ?? []).forEach((m, i) => {
    if (!m.kind || m.kind === "featured") return;
    out.push({ n: i + 1, kind: m.kind, placement: m.placement, shows: m.shows, alt: m.alt || m.shows, ...(m.url ? { url: m.url } : {}), ...(m.numbers ? { numbers: m.numbers } : {}), ...(m.sources?.length ? { sources: m.sources } : {}) });
  });
  return out.slice(0, MAX_IMAGES);
}

export const isDrawn = (k: ImageKind): k is DrawnKind => (DRAWN_KINDS as readonly string[]).includes(k);

// ─────────────── the spec call ───────────────
export const SPECS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["specs"],
  properties: {
    specs: {
      type: "array",
      items: { ...IMAGE_SPEC_SCHEMA, required: ["n", ...IMAGE_SPEC_SCHEMA.required], properties: { n: { type: "integer" }, ...IMAGE_SPEC_SCHEMA.properties } },
    },
  },
};

/** The text of the article where each image goes, so a spec only uses what the reader will read around it. */
export type ArticleText = { title: string; sections: { h2: string; text: string }[] };

/** One Claude call for every drawn image: a spec each, from the article as written and its sources. */
export function specPrompt(tasks: ImageTask[], article: ArticleText): string {
  const drawn = tasks.filter((t) => isDrawn(t.kind));
  const where = (t: ImageTask) => {
    if (t.placement === FEATURED) return "the top of the post";
    const s = article.sections.find((x) => x.h2.toLowerCase() === t.placement.toLowerCase());
    return t.placement === "intro" ? "the intro" : `under "${s?.h2 ?? t.placement}"`;
  };
  return `Write the specs for the article's images. Each image is drawn from your spec in the brand's own style, so you only give the words and numbers.

The article: ${article.title}

${article.sections.map((s) => `## ${s.h2 || "Intro"}\n${s.text.slice(0, 3000)}`).join("\n\n")}

Images (n, kind, where it goes, what it shows):
${drawn.map((t) => `- n ${t.n}: ${t.kind}, ${where(t)}. ${t.shows}${t.numbers ? ` Numbers: ${t.numbers}.` : ""}`).join("\n")}

How each kind uses the fields:
- featured: title is the article's title or a shorter version of it. items: 2 or 3 labels of 1 to 3 words for things the article is about (text and value empty). No numbers.
- chart: title says what is measured; subtitle says the unit or the scope. items: one bar each, 2 to 8, with label (the thing) and value (the number as the reader should see it, like "$39/mo" or "38%"); text is an optional short note. highlight is the label of the one bar the article is about. source names where the numbers come from.
- steps: items in order, 2 to 8, each with label (2 to 5 words) and text (one plain sentence).
- comparison: columns, 2 or 3, each with a title and 2 to 5 short points.
- checklist: items, 3 to 10, each with label (a short check) and an optional text.
- anatomy: items, 3 to 7 parts from top to bottom, each with label and text (what that part does).

Rules:
- Reply with one spec per n above, with that n and kind.
- Every number must come from the article text above. Never invent or round a number. If the text has no numbers for a chart, still use only the text's numbers or make it a steps or checklist spec of the same n.
- Titles under 70 characters. Labels under 40. Texts under 140. Plain words, no dashes, no emoji.
- source is empty unless the image shows numbers.`;
}

const numbers = (s: string) => [...s.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0].replace(/\.0+$/, ""));

/**
 * The numbers a spec shows that the article text doesn't have. Chart values are checked always; in other text,
 * numbers with a currency sign or a percent, or of three digits and more, are checked (a step's "3" is fine).
 */
export function unsupportedNumbers(spec: ImageSpec, text: string): string[] {
  const have = new Set(numbers(text));
  const want: string[] = [];
  if (spec.kind === "chart") for (const i of spec.items) want.push(...numbers(i.value));
  const loose = [spec.title, spec.subtitle, ...spec.items.flatMap((i) => [i.label, i.text, spec.kind === "chart" ? "" : i.value]), ...spec.columns.flatMap((c) => [c.title, ...c.points])].join(" \n ");
  for (const m of loose.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/[$€£]\s?\d+(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\d{3,}(?:\.\d+)?/g)) want.push(...numbers(m[0]));
  return [...new Set(want.filter((n) => !have.has(n)))];
}

export type Render = { n: number; kind: ImageKind; html: string; url?: string };

/**
 * Turn Claude's specs into pages for the worker. A spec that is missing, fails its checks or shows a number the
 * article doesn't have becomes a missing image with the reason. The featured image always gets made: without a
 * good spec it uses the article's title. Screenshots get their frame page now; the worker puts the shot in it.
 */
export function planRenders(tasks: ImageTask[], raw: unknown, article: ArticleText, kit: BrandKit | null): { renders: Render[]; missing: (MissingImage & { n: number })[] } {
  const list = Array.isArray((raw as { specs?: unknown })?.specs) ? ((raw as { specs: unknown[] }).specs as Record<string, unknown>[]) : [];
  const text = [article.title, ...article.sections.map((s) => `${s.h2}\n${s.text}`)].join("\n");
  const renders: Render[] = [];
  const missing: (MissingImage & { n: number })[] = [];
  for (const t of tasks) {
    const miss = (reason: string) => missing.push({ n: t.n, placement: t.placement, kind: t.kind, shows: t.shows, ...(t.url ? { url: t.url } : {}), reason });
    if (t.kind === "screenshot") {
      if (!t.url) miss("The brief names no page to take a picture of.");
      else renders.push({ n: t.n, kind: t.kind, url: t.url, html: renderFrame(t.url, kit) });
      continue;
    }
    if (!isDrawn(t.kind)) continue;
    const got = list.find((x) => Number(x?.n) === t.n);
    let spec: ImageSpec | null = null;
    let why = "No spec came back for this image.";
    if (got) {
      // A chart Claude turned into steps or a checklist (no numbers in the text) is kept in its new kind.
      const kind = DRAWN_KINDS.includes(got.kind as DrawnKind) && (t.kind === "chart" || got.kind === t.kind) && got.kind !== "featured" ? (got.kind as DrawnKind) : t.kind;
      const c = cleanSpec(got, t.kind === "featured" ? "featured" : kind);
      if (c.ok) {
        const bad = unsupportedNumbers(c.spec, text);
        if (bad.length) why = `It showed numbers the article doesn't have: ${bad.slice(0, 4).join(", ")}.`;
        else spec = c.spec;
      } else why = c.error;
    }
    if (!spec && t.kind === "featured") spec = { kind: "featured", title: article.title.slice(0, 110), subtitle: "", source: "", items: [], columns: [], highlight: "" };
    if (!spec) {
      miss(why);
      continue;
    }
    renders.push({ n: t.n, kind: spec.kind, html: renderImage(spec, kit) });
  }
  return { renders, missing };
}

// ─────────────── what the draft gets back ───────────────
export type ImageRow = { n: number; kind: string; status: "queued" | "working" | "done" | "failed"; public_url: string | null; width: number | null; height: number | null; error: string | null; created_at: string };

/**
 * The image step's answer from the saved rows: wait while the worker is still making images (up to WAIT_MS from
 * the first row), then every finished image placed where the brief put it, and the rest as notes with the reason.
 */
export function imagesResult(tasks: ImageTask[], rows: ImageRow[], now: number): ImagesOut {
  const started = Math.min(...rows.map((r) => Date.parse(r.created_at)).filter(Number.isFinite), now);
  const open = rows.filter((r) => r.status === "queued" || r.status === "working");
  if (open.length && now - started < WAIT_MS) return { state: "wait", why: `${open.length} image${open.length === 1 ? "" : "s"} being made` };
  const placed: PlacedImage[] = [];
  const missing: MissingImage[] = [];
  let featured: PlacedImage | null = null;
  for (const t of tasks) {
    const r = rows.find((x) => x.n === t.n);
    if (r?.status === "done" && r.public_url) {
      const img: PlacedImage = { placement: t.placement, kind: t.kind, src: r.public_url, alt: t.alt, width: r.width ?? 1600, height: r.height ?? 900 };
      if (t.placement === FEATURED) featured = img;
      else placed.push(img);
      continue;
    }
    if (t.placement === FEATURED) continue; // no featured image is fine: Publish asks for one
    const reason = !r ? "This image was not made." : r.status === "failed" ? (r.error ?? "This image could not be made.") : "This image took too long to make.";
    missing.push({ placement: t.placement, kind: t.kind, shows: t.shows, ...(t.url ? { url: t.url } : {}), reason });
  }
  return { state: "done", placed, missing, featured };
}

type ImageNode = { type: "image"; attrs: { src: string; alt: string; title: string | null } };

/** The images that go under one heading ("intro" for the intro), as editor nodes. */
export function imageNodes(placed: PlacedImage[], placement?: string): ImageNode[] {
  const key = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
  return placed
    .filter((p) => placement === undefined || key(p.placement) === key(placement))
    .map((p) => ({ type: "image" as const, attrs: { src: p.src, alt: p.alt, title: p.caption ?? null } }));
}

/** A missing image as the note the writer sees in the editor, with what to add. */
export const missingNote = (m: MissingImage) => ({
  type: "note",
  content: [{ type: "text", text: `${m.kind === "screenshot" ? "Add screenshot" : "Add image"}: ${m.shows}${m.url ? ` (${m.url})` : ""}. ${m.reason}` }],
});

/** A file name for an image: the same for the same draft version and n, so a retry overwrites it. */
export const imagePath = (workspaceId: string, draftId: string, version: number, n: number, ext: "png" | "jpg") => `${workspaceId}/${draftId}/${version}/${n}.${ext}`;

