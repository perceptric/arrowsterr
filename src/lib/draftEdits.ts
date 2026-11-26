// Zippie's edits to a saved draft (Plan & Create › Writer): exact "find this, put that" changes to the article's text,
// shown on a card first and applied only when the person presses Apply. A change applies only when its text appears
// exactly once in one run of text, so it never lands in the wrong place or breaks a link or bold word around it. Pure.

export type DraftEdit = { find: string; replace: string };
type Node = { type?: string; text?: string; content?: Node[]; [k: string]: unknown };

/** Every text run in the draft, in reading order, with its parent so a run can be changed in place. */
function runs(node: Node, out: { node: Node; parent: Node | null }[] = [], parent: Node | null = null) {
  if (typeof node.text === "string") out.push({ node, parent });
  for (const c of node.content ?? []) runs(c, out, node);
  return out;
}

const count = (hay: string, needle: string) => (needle ? hay.split(needle).length - 1 : 0);

/**
 * Apply the edits to a copy of the draft. `applied` and `missed` hold the edits' positions: an edit is missed when its
 * text is empty, not found, or found more than once (then it needs more words around it to be exact).
 */
export function applyEdits(doc: Record<string, unknown>, edits: DraftEdit[]): { doc: Record<string, unknown>; applied: number[]; missed: { index: number; why: string }[] } {
  const copy = structuredClone(doc) as Node;
  const applied: number[] = [];
  const missed: { index: number; why: string }[] = [];
  edits.forEach((e, index) => {
    const find = e.find ?? "";
    if (!find.trim()) return missed.push({ index, why: "nothing to find" });
    const all = runs(copy);
    const hits = all.filter((r) => count(r.node.text!, find) > 0);
    const total = hits.reduce((n, r) => n + count(r.node.text!, find), 0);
    if (!total) return missed.push({ index, why: all.some((r) => r.node.text!.includes(find.slice(0, 20))) ? "the text is split by a link or bold word: pick a shorter piece" : "not found in the draft" });
    if (total > 1) return missed.push({ index, why: "found more than once: add words around it" });
    const hit = hits[0];
    hit.node.text = hit.node.text!.replace(find, e.replace ?? "");
    // A run left empty is taken out, as the editor would.
    if (!hit.node.text && hit.parent?.content) hit.parent.content = hit.parent.content.filter((c) => c !== hit.node);
    applied.push(index);
  });
  return { doc: copy as Record<string, unknown>, applied, missed };
}

/**
 * New sections for a refresh, added to a copy of the draft: before the FAQ when the draft has one (an H2 that says
 * "questions" or "FAQ"), otherwise at the end. Paragraphs are plain text.
 */
export function addSections(doc: Record<string, unknown>, sections: { h2: string; paragraphs: string[] }[]): Record<string, unknown> {
  const copy = structuredClone(doc) as Node;
  const content = (copy.content ??= []);
  const nodes: Node[] = sections.flatMap((s) => [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: s.h2 }] },
    ...s.paragraphs.filter((t) => t.trim()).map((t) => ({ type: "paragraph", content: [{ type: "text", text: t.trim() }] })),
  ]);
  const isFaq = (n: Node) => n.type === "heading" && (n.attrs as { level?: number } | undefined)?.level === 2 && /\b(faqs?|questions)\b/i.test(runs(n).map((r) => r.node.text).join(" "));
  const at = content.findIndex(isFaq);
  content.splice(at >= 0 ? at : content.length, 0, ...nodes);
  return copy as Record<string, unknown>;
}

/** The draft's word count, for the Drafts list. */
export function wordsIn(doc: Record<string, unknown>): number {
  return runs(doc as Node)
    .map((r) => r.node.text!)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}
