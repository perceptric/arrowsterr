// Agentic Writing images (docs/agentic-writing.md, section 5): the shapes the brief, the draft and the image worker
// share. Pure types and lists, so the browser, the server and tests can all use them.

/** What an image is. Screenshots are taken of a real page; the others are drawn from a spec in the Brand Kit. */
export const IMAGE_KINDS = ["featured", "screenshot", "chart", "steps", "comparison", "checklist", "anatomy"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
export const IMAGE_KIND_LABEL: Record<ImageKind, string> = {
  featured: "Featured image",
  screenshot: "Screenshot",
  chart: "Chart",
  steps: "Steps",
  comparison: "Comparison",
  checklist: "Checklist",
  anatomy: "Anatomy",
};

/**
 * Where the brief says an image helps: the H2 it goes under ("intro" for the intro), what it shows and its alt text.
 * kind and url come with Agentic Writing; older briefs have neither and stay notes. A screenshot names the page
 * (url). A chart names its numbers and the source numbers behind them.
 */
export type BriefImage = { placement: string; shows: string; alt: string; kind?: ImageKind; url?: string; numbers?: string; sources?: number[] };

/** An image the draft made, saved in the doc-images bucket, ready to go in the doc. */
export type PlacedImage = { placement: string; kind: ImageKind; src: string; alt: string; width: number; height: number; caption?: string };

/** An image the draft could not make. It stays as a note in the doc, so a person can add it. */
export type MissingImage = { placement: string; kind: ImageKind; shows: string; url?: string; reason: string };

/** What the draft's image step returns: come back later, or the images made and the ones that need a person. */
export type ImagesOut = { state: "wait"; why: string } | { state: "done"; placed: PlacedImage[]; missing: MissingImage[]; featured: PlacedImage | null };
