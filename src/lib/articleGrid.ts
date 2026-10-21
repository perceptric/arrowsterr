// The Library grid (docs/content-grid.md): one row per article. Metadata columns (Status, Meta title, Meta
// description, Slug), then Content columns in pairs: H1 and Section 1, H2 and Section 2, up to H20 and Section 20,
// and more when someone adds them. A heading column holds the title, its section column the text under it.
// H1 is the article's title and Section 1 its intro; each H2 in the draft is the next heading, with its section.
// Pure, shared by the browser and the tests.
import type { PmNode } from "./docHtml.ts";

export type Slice = { h2: string; nodes: PmNode[] };
export type Split = { intro: PmNode[]; sections: Slice[] };

const textOf = (n: PmNode): string => (n.type === "text" ? (n.text ?? "") : (n.content ?? []).map(textOf).join(n.type === "paragraph" || n.type === "heading" ? "" : " "));
const isH2 = (n: PmNode) => n.type === "heading" && Number(n.attrs?.level) === 2;

/** The doc's top-level nodes, or none. */
export const nodesOf = (content: unknown): PmNode[] => {
  const d = content as PmNode | null;
  return d && typeof d === "object" && Array.isArray(d.content) ? d.content : [];
};

/** The doc as an intro and its sections. Each section's nodes start with its H2. */
export function splitDoc(content: unknown): Split {
  const intro: PmNode[] = [];
  const sections: Slice[] = [];
  for (const n of nodesOf(content)) {
    if (isH2(n)) sections.push({ h2: textOf(n).trim(), nodes: [n] });
    else if (sections.length) sections[sections.length - 1].nodes.push(n);
    else intro.push(n);
  }
  return { intro, sections };
}

// ─────────────── what a section cell shows ───────────────
export type Has = "image" | "table" | "list" | "html" | "quote";
export type CellSummary = { preview: string; words: number; has: Has[] };

function walk(n: PmNode, seen: Set<Has>) {
  if (n.type === "image") seen.add("image");
  else if (n.type === "table") seen.add("table");
  else if (n.type === "bulletList" || n.type === "orderedList") seen.add("list");
  else if (n.type === "embed" || /module/i.test(n.type)) seen.add("html");
  else if (n.type === "blockquote") seen.add("quote");
  for (const c of n.content ?? []) walk(c, seen);
}

/** A section's face: the start of its text, its word count and what's inside. */
export function summarize(nodes: PmNode[]): CellSummary {
  const seen = new Set<Has>();
  nodes.forEach((n) => walk(n, seen));
  const text = nodes.map(textOf).join(" ").replace(/\s+/g, " ").trim();
  return { preview: text.slice(0, 160), words: text ? text.split(" ").length : 0, has: (["image", "table", "list", "html", "quote"] as Has[]).filter((h) => seen.has(h)) };
}

// ─────────────── heading and section pairs ───────────────
/** One pair of content columns: the heading's title, and what's written under it (null before the draft). */
export type Pair = { heading: string; body: CellSummary | null };

/**
 * A row's content columns. A written draft gives its title and intro, then each H2 and its text. Before the draft,
 * the brief's H1 and outline fill the headings and the sections stay empty. Nothing at all gives no pairs.
 */
export function contentPairs(doc: { title: string; content: unknown } | null, plan: { h1: string; outline: string[] } | null): Pair[] {
  if (doc) {
    const s = splitDoc(doc.content);
    return [{ heading: doc.title, body: summarize(s.intro) }, ...s.sections.map((x) => ({ heading: x.h2, body: summarize(x.nodes.slice(1)) }))];
  }
  if (plan) return [{ heading: plan.h1, body: null }, ...plan.outline.map((h) => ({ heading: h, body: null }))];
  return [];
}

export const BASE_PAIRS = 20;

/** How many pairs the grid shows: 20, plus any someone added, and never fewer than the longest article needs. */
export const pairCount = (longest: number, added: number) => Math.max(BASE_PAIRS + Math.max(0, added), longest);

// ─────────────── output ───────────────
/** The doc as plain text: headings and paragraphs on their own lines, list items with a dash. */
export function docToText(content: unknown): string {
  const lines: string[] = [];
  const block = (n: PmNode, depth = 0) => {
    if (n.type === "heading" || n.type === "paragraph") {
      const t = textOf(n).trim();
      if (t) lines.push(t);
    } else if (n.type === "bulletList" || n.type === "orderedList") {
      (n.content ?? []).forEach((li, i) => {
        const [first, ...rest] = li.content ?? [];
        lines.push(`${"  ".repeat(depth)}${n.type === "orderedList" ? `${i + 1}.` : "-"} ${first ? textOf(first).trim() : ""}`);
        rest.forEach((r) => block(r, depth + 1));
      });
    } else if (n.type === "table") {
      for (const row of n.content ?? []) lines.push((row.content ?? []).map((c) => textOf(c).trim()).join(" | "));
    } else if (n.type === "blockquote") {
      (n.content ?? []).forEach((c) => lines.push(`> ${textOf(c).trim()}`));
    } else if (n.type === "image") {
      if (n.attrs?.alt) lines.push(`[Image: ${n.attrs.alt}]`);
    } else if (n.type === "embed" || n.type === "note") {
      // Interactive HTML has no text form, and notes never leave the editor.
    } else (n.content ?? []).forEach((c) => block(c, depth));
  };
  nodesOf(content).forEach((n) => block(n));
  return lines.join("\n\n");
}

/** A column's letter, like a sheet: 0 is A, 25 is Z, 26 is AA. */
export function letter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
