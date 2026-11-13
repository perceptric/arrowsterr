// Fixes code can make on a draft without changing a fact (docs/zippie-skills-plan.md, section 2): curly quotes made
// straight, a feeling adverb used a second time dropped, and long paragraphs split between sentences. Words and
// numbers are never changed, only quote marks, one leading adverb and where a paragraph breaks. Pure.
import { FEELING } from "./houseRules.ts";

type Block = { type: string; text: string; items: string[]; rows: string[][] };
type Section<B extends Block = Block> = { key: string; h2: string; blocks: B[] };

// The closing quote or bracket stays with its sentence, so joining the sentences back loses nothing.
const SENT = /(?<=[.!?…]["”)\]]?)\s+(?=["“(\[]?[A-Z0-9])/;
const split = (t: string) => t.split(SENT).map((s) => s.trim()).filter(Boolean);
const words = (t: string) => t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").split(/\s+/).filter(Boolean).length;

/** Curly quotes made straight, outside link addresses. */
export const straighten = (t: string) =>
  t.replace(/(\]\([^)]*\))|[‘’]|[“”]/g, (m, link) => (link ? link : /[‘’]/.test(m) ? "'" : '"'));

/** A paragraph's sentences in groups of at most 3, and at most about 75 words, kept in order. */
export function splitParagraph(text: string): string[] {
  const list = split(text);
  if (list.length <= 1) return [text];
  if (list.length <= 3 && words(text) <= 75) return [text];
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const s of list) {
    if (cur.length && (cur.length >= 3 || words([...cur, s].join(" ")) > 75)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(s);
  }
  if (cur.length) groups.push(cur);
  // A lone last sentence joins the group before when that group has room.
  if (groups.length > 1 && groups[groups.length - 1].length === 1 && groups[groups.length - 2].length < 3 && words([...groups[groups.length - 2], ...groups[groups.length - 1]].join(" ")) <= 75) {
    const last = groups.pop()!;
    groups[groups.length - 1].push(...last);
  }
  return groups.map((g) => g.join(" "));
}

const ADVERB = new RegExp(`^(\\*\\*)?(${FEELING.join("|")}),\\s+`, "i");

/** Drop a leading feeling adverb ("Honestly, ") from a sentence, keeping the rest and capitalizing its first letter. */
export function dropAdverb(sentence: string): string {
  const rest = sentence.replace(ADVERB, "$1");
  return rest === sentence ? sentence : rest.replace(/^(\*\*)?([a-z])/, (_, b = "", c: string) => `${b}${c.toUpperCase()}`);
}

/** All the safe fixes on a draft. Returns the new sections and a note for each change. */
export function tidy<B extends Block>(sections: Section<B>[]): { sections: Section<B>[]; notes: string[] } {
  const notes: string[] = [];
  const seen = new Set<string>();
  const out = sections.map((s) => {
    const blocks: B[] = [];
    for (const b of s.blocks) {
      const fixed: B = { ...b, text: straighten(b.text), items: b.items.map(straighten), rows: b.rows.map((r) => r.map(straighten)) };
      if (fixed.type === "p" || fixed.type === "quote") {
        // A feeling adverb used before in the article is dropped.
        const sentences = split(fixed.text).map((t) => {
          const m = t.replace(/^\*\*/, "").match(/^([A-Za-z]+),/);
          const w = m?.[1]?.toLowerCase();
          if (!w || !FEELING.includes(w)) return t;
          if (seen.has(w)) {
            notes.push(`Dropped "${m![1]}," used a second time.`);
            return dropAdverb(t);
          }
          seen.add(w);
          return t;
        });
        fixed.text = sentences.join(" ");
      }
      if (fixed.type === "p") {
        const parts = splitParagraph(fixed.text);
        if (parts.length > 1) notes.push(`Split a ${split(fixed.text).length}-sentence paragraph in "${s.h2 || "the intro"}".`);
        for (const p of parts) blocks.push({ ...fixed, text: p });
      } else blocks.push(fixed);
    }
    return { ...s, blocks };
  });
  return { sections: out, notes };
}
