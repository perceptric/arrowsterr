// The Library grid (docs/content-grid.md): one row per article, one column per part.
// An article is its saved doc (docs.content, the editor's ProseMirror JSON). Nothing about its shape is fixed:
// the intro is everything before the first H2, and each H2 starts a section that runs to the next one.
// So a section can hold anything the editor can: text, lists, tables, images and interactive HTML.
// Moving a section moves its slice of the doc; editing one cell writes its slice back.
// Sections a person edited by hand are locked (docs.meta.locked), and a regenerated draft keeps them.
// Pure, shared by the browser, the server and the tests.
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

/** Move section `from` to position `to`. Out of range leaves the doc as it was. */
export function moveSection(content: unknown, from: number, to: number): PmNode {
  const s = splitDoc(content);
  if (from === to || from < 0 || to < 0 || from >= s.sections.length || to >= s.sections.length) return joinDoc(s);
  const sections = [...s.sections];
  const [x] = sections.splice(from, 1);
  sections.splice(to, 0, x);
  return joinDoc({ ...s, sections });
}

/** A cell's part of the doc: "intro" or a section's index. */
export type Part = "intro" | number;

/** The nodes one cell edits: the intro, or a section with its H2. */
export function partNodes(content: unknown, part: Part): PmNode[] {
  const s = splitDoc(content);
  return part === "intro" ? s.intro : (s.sections[part]?.nodes ?? []);
}

/**
 * Put a cell's edited nodes back. A section that comes back without an H2 at its top gets its old one,
 * so a cell can never swallow the section boundary; extra H2s inside it become sections of their own.
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

/** Add an empty section with this H2 after `after` (or at the end). */
export function addSection(content: unknown, h2: string, after?: number): PmNode {
  const s = splitDoc(content);
  const at = after === undefined ? s.sections.length : Math.min(s.sections.length, after + 1);
  const sections = [...s.sections];
  sections.splice(at, 0, { h2, nodes: [{ type: "heading", attrs: { level: 2 }, content: h2 ? [{ type: "text", text: h2 }] : [] }, { type: "paragraph" }] });
  return joinDoc({ ...s, sections });
}

export function removeSection(content: unknown, part: number): PmNode {
  const s = splitDoc(content);
  return joinDoc({ ...s, sections: s.sections.filter((_, i) => i !== part) });
}

// ─────────────── what a cell shows ───────────────
export type Has = "image" | "table" | "list" | "html" | "quote";
export type CellSummary = { title: string; preview: string; words: number; has: Has[] };

function walk(n: PmNode, seen: Set<Has>) {
  if (n.type === "image") seen.add("image");
  else if (n.type === "table") seen.add("table");
  else if (n.type === "bulletList" || n.type === "orderedList") seen.add("list");
  else if (n.type === "embed" || /module/i.test(n.type)) seen.add("html");
  else if (n.type === "blockquote") seen.add("quote");
  for (const c of n.content ?? []) walk(c, seen);
}

/** A cell's face: its H2, the start of its text, its word count and what's inside. */
export function summarize(nodes: PmNode[]): CellSummary {
  const seen = new Set<Has>();
  nodes.forEach((n) => walk(n, seen));
  const body = nodes.filter((n, i) => !(i === 0 && isH2(n)));
  const text = body.map(textOf).join(" ").replace(/\s+/g, " ").trim();
  return { title: nodes[0] && isH2(nodes[0]) ? textOf(nodes[0]).trim() : "", preview: text.slice(0, 160), words: text ? text.split(" ").length : 0, has: (["image", "table", "list", "html", "quote"] as Has[]).filter((h) => seen.has(h)) };
}

// ─────────────── locks ───────────────
/** The name a lock goes by: "intro", or the section's H2 in lower case with spaces squeezed. */
export const lockKey = (part: Part, content: unknown) => (part === "intro" ? "intro" : (splitDoc(content).sections[part]?.h2 ?? "").toLowerCase().replace(/\s+/g, " ").trim());

/**
 * A freshly written doc with the locked parts of the old one put back: a locked intro replaces the new intro,
 * and a locked section replaces the new section with the same H2, or goes back to its old place when the new
 * draft has no such section. Everything else comes from the new doc.
 */
export function keepLocked(oldContent: unknown, newContent: unknown, locked: string[]): PmNode {
  const keys = new Set(locked.map((k) => k.toLowerCase().replace(/\s+/g, " ").trim()).filter(Boolean));
  const next = splitDoc(newContent);
  if (!keys.size) return joinDoc(next);
  const old = splitDoc(oldContent);
  const intro = keys.has("intro") && old.intro.length ? old.intro : next.intro;
  const key = (x: Slice) => x.h2.toLowerCase().replace(/\s+/g, " ").trim();
  const sections = next.sections.map((x) => (keys.has(key(x)) ? (old.sections.find((o) => key(o) === key(x)) ?? x) : x));
  old.sections.forEach((o, i) => {
    if (!keys.has(key(o)) || sections.some((x) => key(x) === key(o))) return;
    sections.splice(Math.min(i, sections.length), 0, o);
  });
  return joinDoc({ intro, sections });
}

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

// ─────────────── columns ───────────────
/** A column's letter, like a sheet: 0 is A, 25 is Z, 26 is AA. */
export function letter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * An AI column's prompt with its references filled in: {{F}} by a column's letter, or {{H1}} by its name
 * (any case). An unknown reference is left as written, so the person can see what didn't match.
 */
export function fillPrompt(prompt: string, cols: { letter: string; name: string; value: string }[]): string {
  return prompt.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (all, ref: string) => {
    const r = ref.toLowerCase();
    const c = cols.find((x) => x.letter.toLowerCase() === r) ?? cols.find((x) => x.name.toLowerCase() === r);
    return c ? c.value : all;
  });
}
