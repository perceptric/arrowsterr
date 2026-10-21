// The Library grid (docs/content-grid.md): one row per article. Metadata columns (Status, Meta title, Meta
// description, Slug), then Content columns in pairs: H1 and Section 1, H2 and Section 2, up to H20 and Section 20,
// and more when someone adds them. A heading column holds the title, its section column the text under it.
// H1 is the article's title and Section 1 its intro; each H2 in the doc is the next heading, with its section.
// The brief makes the doc's skeleton (its headings, empty sections); writers fill each section in the side panel.
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

/** The intro and sections as one doc again. An empty doc keeps one empty paragraph, as the editor does. */
export function joinDoc(s: Split): PmNode {
  const content = [...s.intro, ...s.sections.flatMap((x) => x.nodes)];
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** A section column's part of the doc: "intro" for Section 1, or the index of an H2 section. */
export type Part = "intro" | number;
export const partOfPair = (pair: number): Part => (pair === 0 ? "intro" : pair - 1);

/** The nodes one section column edits: the intro, or an H2 section with its H2 first. */
export function partNodes(content: unknown, part: Part): PmNode[] {
  const s = splitDoc(content);
  return part === "intro" ? s.intro : (s.sections[part]?.nodes ?? []);
}

/**
 * Put a section's edited nodes back. A section that comes back without an H2 at its top gets its old one,
 * so it can never swallow the boundary; extra H2s inside it become sections of their own.
 */
export function replacePart(content: unknown, part: Part, nodes: PmNode[]): PmNode {
  const s = splitDoc(content);
  if (part === "intro") {
    const parts = splitDoc({ type: "doc", content: nodes });
    return joinDoc({ intro: parts.intro, sections: [...parts.sections, ...s.sections] });
  }
  const old = s.sections[part];
  if (!old) return joinDoc(s);
  const fixed = nodes.length && isH2(nodes[0]) ? nodes : [old.nodes[0], ...nodes];
  const parts = splitDoc({ type: "doc", content: fixed });
  const sections = [...s.sections];
  sections.splice(part, 1, ...parts.sections);
  return joinDoc({ ...s, sections });
}

// ─────────────── the doc the brief starts ───────────────
export type BriefOutline = { h2: string; points: string[]; h3: string[]; sources: { n: number; title: string; url: string }[] };
export type BriefPlan = { h1: string; intro: string[]; outline: BriefOutline[]; faqs: { question: string; answer: string }[]; modules?: { type: string; title: string; placement: string }[] };
export const FAQ_H2 = "Frequently asked questions";

const heading = (level: number, text: string): PmNode => ({ type: "heading", attrs: { level }, content: text ? [{ type: "text", text }] : [] });
const EMPTY: PmNode = { type: "paragraph" };

/** The doc a writer starts from: an empty intro, then each H2 of the brief (with its H3s) and the FAQ, all empty. */
export function briefSkeleton(plan: BriefPlan): PmNode {
  const content: PmNode[] = [EMPTY];
  for (const o of plan.outline) {
    content.push(heading(2, o.h2));
    if (o.h3.length) for (const t of o.h3) content.push(heading(3, t), EMPTY);
    else content.push(EMPTY);
  }
  if (plan.faqs.length) {
    content.push(heading(2, FAQ_H2));
    for (const f of plan.faqs) content.push(heading(3, f.question), EMPTY);
  }
  return { type: "doc", content };
}

export type GridPlan = BriefPlan & { title: string; description: string; slug: string };

export type RawBrief = {
  h1?: string;
  titles?: string[];
  metaDescription?: string;
  slug?: string;
  angle?: string;
  searchIntent?: string;
  outline?: { h2: string; points?: string[]; h3?: { title: string }[]; sources?: number[] }[];
  faqs?: { question: string; answer?: string }[];
  research?: { sources?: { n: number; title: string; url: string }[] };
  modules?: { type: string; title: string; placement: string }[];
};

/** The brief as the grid reads it: titles, meta, the intro's notes, each H2 with its points and sources, the FAQs. */
export function planOf(p: RawBrief | null): GridPlan | null {
  if (!p) return null;
  const sources = p.research?.sources ?? [];
  return {
    h1: p.h1 ?? "",
    title: p.titles?.[0] ?? p.h1 ?? "",
    description: p.metaDescription ?? "",
    slug: p.slug ?? "",
    intro: [p.angle, p.searchIntent].filter((x): x is string => Boolean(x)),
    outline: (p.outline ?? []).map((o) => ({
      h2: o.h2,
      points: o.points ?? [],
      h3: (o.h3 ?? []).map((x) => x.title),
      sources: (o.sources ?? []).map((n) => sources.find((s) => s.n === n)).filter((s): s is { n: number; title: string; url: string } => Boolean(s)),
    })),
    faqs: (p.faqs ?? []).map((f) => ({ question: f.question, answer: f.answer ?? "" })),
    modules: (p.modules ?? []).map((m) => ({ type: m.type, title: m.title, placement: m.placement })),
  };
}

/** What the brief says to write in one section: the intro's notes, the H2's points and sources, or the FAQs. */
export type SectionNotes = { points: string[]; sources: { n: number; title: string; url: string }[] };
const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export function notesFor(plan: BriefPlan | null, part: Part, h2: string): SectionNotes | null {
  if (!plan) return null;
  if (part === "intro") return plan.intro.length ? { points: plan.intro, sources: [] } : null;
  if (key(h2) === key(FAQ_H2) && plan.faqs.length) return { points: plan.faqs.map((f) => `${f.question} ${f.answer}`.trim()), sources: [] };
  const o = plan.outline.find((x) => key(x.h2) === key(h2));
  return o ? { points: [...o.points, ...o.h3.map((t) => `H3: ${t}`)], sources: o.sources } : null;
}

/** The module the brief planned for a section, by its H2, or null. */
export const plannedModule = (plan: BriefPlan | null, h2: string) => plan?.modules?.find((m) => key(m.placement) === key(h2))?.type ?? null;

// ─────────────── before generating ───────────────
/** What the Brand page still needs before content can be generated in the brand's voice. */
export function brandMissing(c: { voice: unknown; guidelines: unknown; kit: unknown }): string[] {
  return [c.voice ? "" : "Brand Voice", c.guidelines ? "" : "Brand Guidelines", c.kit ? "" : "Brand Kit"].filter(Boolean);
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
 * A row's content columns. A doc gives its title and intro, then each H2 and its text. Before the doc, the brief's
 * H1, outline and FAQ fill the headings and the sections stay empty. Nothing at all gives no pairs.
 */
export function contentPairs(doc: { title: string; content: unknown } | null, plan: Pick<BriefPlan, "h1" | "outline" | "faqs"> | null): Pair[] {
  if (doc) {
    const s = splitDoc(doc.content);
    return [{ heading: doc.title, body: summarize(s.intro) }, ...s.sections.map((x) => ({ heading: x.h2, body: summarize(x.nodes.slice(1)) }))];
  }
  if (plan) return [{ heading: plan.h1, body: null }, ...plan.outline.map((o) => ({ heading: o.h2, body: null })), ...(plan.faqs.length ? [{ heading: FAQ_H2, body: null }] : [])];
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
