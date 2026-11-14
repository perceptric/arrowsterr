// Draft and Write, Phase 1 (docs/draft-and-write-build.md): fact notes and section cards.
//   Fact notes: one call reads the picked source pages and returns facts with their quotes. Code keeps a note only
//     when its quote is on that page word for word (spaces and quote marks evened out) and every number in the fact is
//     in the quote. The notes are saved on the brief and frozen: the writer reads only these.
//   Cards: the outline comes back as one card per section (its job, points, the note ids behind them, words, links and
//     gaps). cleanCards checks each in code: fact ids must be real notes, links come from the sitemap or the sources,
//     words add up to the target, and a point that needs a fact with no note becomes a Detail needed gap.
// Pure, shared by the server, the browser and tests.
import { loose } from "./writerPersona.ts";

export type FactNote = { id: string; source: number; quote: string; fact: string; numbers: string[] };
export type Shape = { usual: string; others: string[]; picked: string; why: string };
export type VisualKind = "flowchart" | "chart" | "table" | "picker" | "calculator" | "screenshot" | "anatomy";
export type VisualPlan = { kind: VisualKind; rule: string; why: string; spec?: unknown; on: boolean };
export type SectionCard = {
  key: string;
  h2: string;
  job: string;
  points: string[];
  facts: string[];
  visual: VisualPlan | null;
  words: number;
  links: { url: string; anchor: string }[];
  keyword?: boolean;
  gaps: string[];
};

export const MAX_NOTES = 40;
/** The page text a note's quote is checked against, per source: the same text the prompt read. */
export type NoteSource = { n: number; url: string; body: string };

const S = { type: "string" } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
export const NOTES_SCHEMA = obj({
  notes: { type: "array", items: obj({ source: { type: "integer" }, quote: S, fact: S }) },
});

/** The notes call, after the cached brand and research: pull the facts this article can stand on. */
export function notesPrompt(keyword: string, sourceCount: number): string {
  return `Read the numbered sources above and pull out the facts an article on "${keyword}" can use. These notes are the only facts the writer will see, so take everything the article needs: numbers, prices, dates, definitions, steps, rules, comparisons, named tools and what each source says about them.

For each note:
- source: the source's number, 1 to ${sourceCount}.
- quote: the exact words from that source's text, copied character for character, 8 to 60 words. Never shorten, join or reword a quote.
- fact: what the quote says, in one plain sentence. Only what the quote says. Every number in the fact must be in the quote, written the same way.

Up to ${MAX_NOTES} notes, the most useful first, no two saying the same thing. Skip anything the sources don't say.`;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
/** Every number in a text, written one way: "1,200" and "1200" match, "$14.99" gives "14.99", years count. */
export const numbersOf = (t: string) => [...new Set([...t.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0].replace(/\.0+$/, "")))];

/**
 * The notes from the reply, checked: the source exists, the quote is on its page word for word, and every number in
 * the fact is in the quote. Ids run n1, n2, ... over the notes that pass. dropped counts the ones that didn't.
 */
export function cleanNotes(x: unknown, sources: NoteSource[]): { notes: FactNote[]; dropped: number } {
  const raw = x && typeof x === "object" ? (x as { notes?: unknown }).notes : null;
  const list = Array.isArray(raw) ? raw : [];
  const notes: FactNote[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const r of list) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const src = sources.find((s) => s.n === Number(o.source));
    const quote = str(o.quote, 600).replace(/^["“]|["”]$/g, "");
    const fact = str(o.fact, 400);
    const ok = src && quote.split(" ").length >= 4 && fact && loose(src.body).includes(loose(quote));
    const inQuote = new Set(numbersOf(quote));
    if (!ok || numbersOf(fact).some((num) => !inQuote.has(num)) || seen.has(loose(quote))) {
      dropped++;
      continue;
    }
    seen.add(loose(quote));
    notes.push({ id: `n${notes.length + 1}`, source: src!.n, quote, fact, numbers: numbersOf(fact) });
    if (notes.length >= MAX_NOTES) break;
  }
  return { notes, dropped };
}

/** The notes as the brief and the writer read them: each with its id, source and quote. */
export function notesText(notes: FactNote[], sources: { n: number; url: string; title?: string }[]): string {
  if (!notes.length) return "Fact notes: none. Use no numbers, prices, dates or claims about named products.";
  const srcs = sources.map((s) => `[${s.n}] ${s.title ? `${s.title} ` : ""}${s.url}`).join("\n");
  return `Sources:\n${srcs}\n\nFact notes (the only facts the article may use; cite each by its source's URL):\n${notes.map((n) => `${n.id} [${n.source}]: ${n.fact} Quote: "${n.quote}"`).join("\n")}`;
}

// ─────────────── cards ───────────────

const linkKey = (u: string) => u.replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();
const has = (text: string, keyword: string) => {
  const words = keyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const t = text.toLowerCase();
  return words.length > 0 && words.every((w) => t.includes(w.replace(/s$/, "")));
};

/**
 * The cards from the reply, checked in code. Fact ids must be real notes; links must be on the brand's sitemap or one
 * of the sources; words are scaled so the sections add up to the target; a point the model flagged as needing a fact
 * it couldn't find (written "Detail needed: ...") moves into gaps. keyword marks the cards whose H2 carries it.
 */
export function cleanCards(
  raw: unknown[],
  opts: { notes: FactNote[]; keyword: string; wordTarget: number; sitemap: string[]; sources: string[] },
): SectionCard[] {
  const ids = new Set(opts.notes.map((n) => n.id));
  const allowed = new Map([...opts.sitemap, ...opts.sources].map((u) => [linkKey(u), u]));
  const cards: SectionCard[] = [];
  raw.forEach((r, i) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const h2 = str(o.h2, 160);
    const key = str(o.key, 40) || (h2 ? `h2-${i}` : "intro");
    const points: string[] = [];
    const gaps: string[] = Array.isArray(o.gaps) ? o.gaps.map((g) => str(g, 300)).filter(Boolean) : [];
    for (const p of Array.isArray(o.points) ? o.points : []) {
      const t = str(p, 400);
      if (!t) continue;
      const m = t.match(/^detail needed:?\s*(.+)$/i);
      if (m) gaps.push(m[1]);
      else points.push(t);
    }
    const facts = [...new Set((Array.isArray(o.facts) ? o.facts : []).map((f) => str(f, 10)).filter((f) => ids.has(f)))];
    const links = (Array.isArray(o.links) ? o.links : [])
      .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
      .map((l) => ({ url: allowed.get(linkKey(str(l.url, 500))) ?? "", anchor: str(l.anchor, 120) }))
      .filter((l) => l.url && l.anchor)
      .slice(0, 4);
    const words = Math.round(Number(o.words));
    cards.push({ key, h2, job: str(o.job, 300), points: points.slice(0, 8), facts: facts.slice(0, 12), visual: null, words: Number.isFinite(words) && words > 0 ? words : 0, links, ...(h2 && has(h2, opts.keyword) ? { keyword: true } : {}), gaps: [...new Set(gaps)].slice(0, 6) });
  });
  // Words: the sections share the target in proportion to what each asked for (an even share when none did).
  const asked = cards.reduce((n, c) => n + c.words, 0);
  for (const c of cards) c.words = Math.max(60, Math.round(asked > 0 ? (c.words / asked) * opts.wordTarget : opts.wordTarget / Math.max(1, cards.length)));
  return cards;
}

/** What a set of cards breaks of the Phase 1 rules, for the brief's checks and the tests. Empty when they pass. */
export function cardProblems(cards: SectionCard[], opts: { notes: FactNote[]; keyword: string; h1: string }): string[] {
  const out: string[] = [];
  const ids = new Set(opts.notes.map((n) => n.id));
  for (const c of cards) {
    const name = c.h2 ? `"${c.h2}"` : "The intro";
    if (!c.job) out.push(`${name} has no job.`);
    if (!c.points.length) out.push(`${name} has no points.`);
    for (const f of c.facts) if (!ids.has(f)) out.push(`${name} cites ${f}, which isn't a note.`);
  }
  if (!has(opts.h1, opts.keyword)) out.push(`The H1 doesn't carry "${opts.keyword}".`);
  if (!cards.some((c) => c.keyword)) out.push(`No H2 carries "${opts.keyword}".`);
  return out;
}

/** Cards for an older brief that has none: one plain card per outline part, from what the brief already holds. */
export function cardsFrom(b: { outline: { h2: string; points: string[] }[]; wordTarget: number; angle?: string; searchIntent?: string }): SectionCard[] {
  const each = Math.round(b.wordTarget / Math.max(1, b.outline.length + 0.6));
  return [
    { key: "intro", h2: "", job: b.searchIntent ?? "", points: [b.angle ?? "", b.searchIntent ?? ""].filter(Boolean), facts: [], visual: null, words: Math.round(each / 2), links: [], gaps: [] },
    ...b.outline.map((p, i) => ({ key: `h2-${i}`, h2: p.h2, job: "", points: p.points, facts: [], visual: null, words: each, links: [], gaps: [] })),
  ];
}

/** The images and modules the brief places under a section, as the outline screen's chips. id is what editBrief's
 * removeImages ("placement|kind|shows") or removeModules (the title) takes. */
export type VisualChip = { kind: "image" | "module"; id: string; label: string };
export function visualsOf(
  b: { images?: { placement: string; shows: string; kind?: string }[]; modules: { title: string; placement: string }[] },
  card: Pick<SectionCard, "key" | "h2">,
): VisualChip[] {
  const at = (p: string) => {
    const x = p.trim().toLowerCase();
    return card.key === "intro" ? x === "intro" || x === "" : x === card.h2.trim().toLowerCase();
  };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return [
    ...(b.images ?? []).filter((m) => at(m.placement)).map((m) => ({ kind: "image" as const, id: `${m.placement}|${m.kind ?? ""}|${m.shows}`, label: cap(m.kind ?? "image") })),
    ...b.modules.filter((m) => at(m.placement)).map((m) => ({ kind: "module" as const, id: m.title, label: m.title })),
  ];
}
