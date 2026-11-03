// Perception: the words AI uses for a brand (docs/perception.md). Pure, so the browser, the worker and tests share it.
// Haiku only picks words from a fixed list and copies a quote for each. Code decides which sentence belongs to which
// brand, and drops any word whose quote isn't really in the answer or isn't about that brand. A wrong word costs more
// than a missing one.

export type PerceptionWord = { word: string; good: boolean; definition: string };
/** The brand's word list, picked once by Haiku and editable. */
export type PerceptionSetup = { words: PerceptionWord[]; madeAt: string };
export type WordHit = { word: string; quote: string };
/** One answer's words for one brand. A row with no words still counts: the answer named the brand and said none. */
export type PerceptionRead = {
  id?: number;
  source: "buyer" | "direct";
  engine: string;
  prompt: string;
  named: string;
  words: WordHit[];
  at: string;
  kind?: "describe" | "objections" | null; // direct answers only
  unknown?: boolean; // a direct answer that says the model doesn't know the brand
};

export const MIN_ANSWERS = 3; // fewer answers than this shows a dash
export const WORD_COUNT = { good: 7, bad: 3 };

/** Raise when the rules change, so recent runs are read again. */
export const PERCEPTION_VERSION = 1;

// ─────────────── brands in text ───────────────

export type BrandMatch = { name: string; re: RegExp };
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A matcher for a brand name ("Zoho CRM" also matches "Zoho  CRM"), plus extra terms like the domain for the tracked brand. */
export function brandMatch(name: string, extra: string[] = []): BrandMatch {
  const terms = [...new Set([name, ...extra].map((t) => t.trim()).filter((t) => t.length >= 3))].sort((a, b) => b.length - a.length);
  const alts = terms.map((t) => escape(t).replace(/\s+/g, "\\s+"));
  return { name, re: new RegExp(`(?<![A-Za-z0-9])(?:${alts.join("|")})(?![A-Za-z0-9])`, "i") };
}

// ─────────────── sentences and who they're about ───────────────

export type Sentence = { id: number; text: string; brands: { name: string; how: "named" | "heading" }[] };

const strip = (s: string) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
// Gemini glues citation domains to the next word ("doublescale.ioIf GHL felt..."), which merges two sentences.
const unglue = (s: string) => s.replace(/[a-z0-9-]+\.(?:com|io|net|org|co|us|ai|app)(?=[A-Z])/g, " ");
const marker = /^\s*(#{1,6}\s*|[-*•]\s+|\d+[.)]\s+)/;
const indent = (l: string) => (l.match(/^\s*/)?.[0] ?? "").length;
const isHeading = (l: string) => /^\s*#{1,6}\s/.test(l) || /^\s*\*\*[^*]+\*\*:?\s*$/.test(l);
const isItem = (l: string) => /^\s*([-*•]|\d+[.)])\s+/.test(l);
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const COMPARISON = /alternativ|\bvs\.?\b|versus|\bthan\b|instead|compar|switch|migrat|leav|unlike/i;

/**
 * Splits an answer into sentences, list items and table rows, and says which brands each is about. A sentence is
 * about the brands it names. One that names none belongs to the brand whose heading or list item it sits under:
 * a heading that names exactly one brand and isn't a comparison ("Best overall: HubSpot", never "Cheaper HubSpot
 * alternatives"), or a list item that starts with the brand ("1. **Jobber** -", "Best for small teams: Jobber").
 * Sentences about no brand are left out.
 */
export function splitAnswer(text: string, brands: BrandMatch[]): Sentence[] {
  const named = (s: string) => brands.filter((b) => b.re.test(s)).map((b) => b.name);
  const clean = (line: string) => strip(line.replace(marker, "")).replace(/^\d+[.)]\s*/, "");
  const startsWith = (lead: string) => {
    const hits = brands.filter((b) => {
      const m = lead.match(b.re);
      return m !== null && (m.index ?? 99) <= 2;
    });
    return hits.length === 1 ? hits[0].name : null;
  };
  const leadBrand = (line: string) => {
    const t = clean(line);
    const colon = t.indexOf(":");
    const label = colon > 0 && colon < 70 && !brands.some((b) => b.re.test(t.slice(0, colon)));
    return startsWith(t.slice(0, 60)) ?? (label ? startsWith(t.slice(colon + 1).trim().slice(0, 60)) : null);
  };
  const headBrand = (line: string) => {
    const t = clean(line).slice(0, 100);
    const hits = named(t);
    return hits.length === 1 && !COMPARISON.test(t) ? hits[0] : null;
  };

  const out: { text: string; owner: string | null }[] = [];
  let headOwner: string | null = null;
  let itemOwner: string | null = null;
  let itemIndent = 0;
  for (const raw of text.split("\n")) {
    const line = unglue(raw);
    if (!line.trim()) continue;
    if (isTableRow(line)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
      const cells = line.split("|").map(strip).filter(Boolean);
      out.push({ text: cells.join(" | "), owner: leadBrand(cells[0] ?? "") });
      continue;
    }
    let owner: string | null;
    if (isHeading(line)) {
      // A bold line with no brand is a subtitle ("**Best for traditional CRM**"), so the brand above keeps it.
      const hb = headBrand(line);
      if (hb || /^\s*#/.test(line)) headOwner = hb;
      itemOwner = null;
      owner = headOwner;
    } else if (isItem(line)) {
      if (itemOwner === null || indent(line) <= itemIndent) {
        itemOwner = leadBrand(line);
        itemIndent = indent(line);
      }
      owner = itemOwner ?? headOwner;
    } else {
      // A plain paragraph closes the list it follows.
      if (indent(line) === 0) itemOwner = null;
      owner = itemOwner ?? headOwner;
    }
    for (const part of line.replace(marker, "").split(/(?<=[.!?])\s+(?=[A-Z0-9*"(])/)) {
      const s = strip(part);
      if (s.length > 3) out.push({ text: s, owner });
    }
  }
  let id = 0;
  return out
    .map((s) => {
      const n = named(s.text);
      const list: Sentence["brands"] = n.length ? n.map((name) => ({ name, how: "named" as const })) : s.owner ? [{ name: s.owner, how: "heading" as const }] : [];
      return { id: ++id, text: s.text, brands: list };
    })
    .filter((s) => s.brands.length);
}

// ─────────────── checking what Haiku gave ───────────────

export const normQuote = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|]+/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\\\$/g, "$")
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?]+$/, "")
    .trim();

export type Dropped = { brand: string; word: string; quote: string; why: string };

/**
 * Keeps a word only when it's on the list, its quote is really in the answer, and the quote sits in a sentence about
 * that brand. On a prompt about leaving a brand ("HubSpot alternatives"), a bad word for it from a sentence that also
 * names another brand is held back: that's usually the question talking. Direct answers are about one brand, so
 * every sentence is theirs.
 */
export function checkWords(
  input: { text: string; prompt: string; source: "buyer" | "direct"; brand: string; brands: BrandMatch[]; words: PerceptionWord[] },
  raw: unknown,
): { kept: WordHit[]; dropped: Dropped[] } {
  const { text, prompt, source, brand, brands, words } = input;
  const canon = new Map(words.map((w) => [w.word.toLowerCase(), w]));
  const full = normQuote(text);
  const sentences = source === "buyer" ? splitAnswer(text, brands) : [];
  const me = brands.find((b) => b.name === brand);
  const leaving = Boolean(me && me.re.test(prompt));
  const kept: WordHit[] = [];
  const dropped: Dropped[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const w = canon.get(String((item as WordHit)?.word ?? "").trim().toLowerCase());
    const quote = String((item as WordHit)?.quote ?? "").replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim();
    const drop = (why: string) => dropped.push({ brand, word: w?.word ?? String((item as WordHit)?.word ?? ""), quote, why });
    if (!w) { drop("Not on the word list"); continue; }
    if (seen.has(w.word)) continue;
    const q = normQuote(quote);
    if (q.split(" ").length < 2 || !full.includes(q)) { drop("Quote isn't in the answer"); continue; }
    if (source === "buyer") {
      const head = q.split(" ").slice(0, 5).join(" ");
      const hits = sentences.filter((s) => { const ns = normQuote(s.text); return ns.includes(q) || q.includes(ns) || ns.includes(head); });
      const mine = hits.filter((s) => s.brands.some((x) => x.name === brand));
      if (!mine.length) { drop(hits.length ? "Quote is about another brand" : "Quote isn't in a sentence about this brand"); continue; }
      if (!w.good && leaving && mine.some((s) => s.brands.length > 1)) { drop("Bad word in a comparison, on a prompt about leaving this brand"); continue; }
    }
    seen.add(w.word);
    kept.push({ word: w.word, quote: quote.slice(0, 300) });
  }
  return { kept: kept.slice(0, 5), dropped };
}

/** A word list from Haiku, cleaned: one word each, no repeats, and exactly 7 good and 3 bad, or null. */
export function cleanWordList(raw: unknown): PerceptionWord[] | null {
  const list = Array.isArray((raw as { words?: unknown })?.words) ? (raw as { words: unknown[] }).words : Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const words: PerceptionWord[] = [];
  for (const item of list) {
    const w = item as Partial<PerceptionWord>;
    const word = String(w?.word ?? "").trim().replace(/[^A-Za-z-]/g, "");
    if (!word || word.length > 18 || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    words.push({ word: word[0].toUpperCase() + word.slice(1).toLowerCase(), good: Boolean(w.good), definition: String(w.definition ?? "").trim().slice(0, 140) });
  }
  const good = words.filter((w) => w.good).slice(0, WORD_COUNT.good);
  const bad = words.filter((w) => !w.good).slice(0, WORD_COUNT.bad);
  return good.length === WORD_COUNT.good && bad.length === WORD_COUNT.bad ? [...good, ...bad] : null;
}

// ─────────────── scores ───────────────

export type Scores = { n: number; share: Record<string, number> };

/** For one brand: the share of its answers that support each word. Each answer counts once per word. */
export function scoresOf(reads: PerceptionRead[], brand: string, words: PerceptionWord[]): Scores {
  const mine = reads.filter((r) => r.named === brand);
  const count = (w: string) => mine.filter((r) => r.words.some((h) => h.word === w)).length;
  return { n: mine.length, share: Object.fromEntries(words.map((w) => [w.word, mine.length ? count(w.word) / mine.length : 0])) };
}

/** A row of perception_summary (059_perception.sql): answers per group when word is null, else answers with that word. */
export type SummaryRow = { source: "buyer" | "direct"; kind: string | null; named: string; engine: string; prompt: string; word: string | null; n: number; unknown: number };

/** The same scores from summary rows. keep picks the groups in view (source, engine, prompt). */
export function scoresFromSummary(rows: SummaryRow[], brand: string, words: PerceptionWord[], keep: (r: SummaryRow) => boolean = () => true): Scores {
  const mine = rows.filter((r) => r.named === brand && keep(r));
  const n = mine.filter((r) => r.word === null).reduce((s, r) => s + r.n, 0);
  const share = Object.fromEntries(words.map((w) => [w.word, n ? mine.filter((r) => r.word === w.word).reduce((s, r) => s + r.n, 0) / n : 0]));
  return { n, share };
}

/** True when at least half the direct "describe" answers say the model doesn't know the brand. */
export function unknownInSummary(rows: SummaryRow[], brand: string): boolean {
  const d = rows.filter((r) => r.source === "direct" && r.kind === "describe" && r.named === brand && r.word === null);
  const n = d.reduce((s, r) => s + r.n, 0);
  return n > 0 && d.reduce((s, r) => s + r.unknown, 0) / n >= 0.5;
}
export const enough = (s: Scores) => s.n >= MIN_ANSWERS;

/** Axis order for the radar: good words around the top, bad words across the bottom, so a shape that leans up reads as good. */
export function radarOrder(words: PerceptionWord[]): PerceptionWord[] {
  const good = words.filter((w) => w.good), bad = words.filter((w) => !w.good);
  const n = words.length, out: (PerceptionWord | undefined)[] = new Array(n);
  const start = Math.round(n / 2) - Math.floor(bad.length / 2);
  bad.forEach((w, i) => (out[start + i] = w));
  let g = 0;
  for (let i = 0; i < n; i++) if (!out[i]) out[i] = good[g++];
  return out as PerceptionWord[];
}

export type Gap = { brand: string; word: string; them: number; you: number };
/** The good word where a rival leads you most. */
export function biggestGap(you: Scores, rivals: { brand: string; scores: Scores }[], words: PerceptionWord[]): Gap | null {
  let best: Gap | null = null;
  for (const r of rivals) {
    if (!enough(r.scores)) continue;
    for (const w of words.filter((x) => x.good)) {
      const them = r.scores.share[w.word], me = enough(you) ? you.share[w.word] : 0;
      if (them > 0 && (!best || them - me > best.them - best.you)) best = { brand: r.brand, word: w.word, them, you: me };
    }
  }
  return best;
}

/** The bad word said most often about a brand, or null. */
export function topBad(s: Scores, words: PerceptionWord[]): { word: string; share: number } | null {
  if (!enough(s)) return null;
  const top = words.filter((w) => !w.good).map((w) => ({ word: w.word, share: s.share[w.word] })).filter((x) => x.share > 0).sort((a, b) => b.share - a.share)[0];
  return top ?? null;
}

const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0]);
const topGood = (s: Scores, words: PerceptionWord[]) => words.filter((w) => w.good && s.share[w.word] >= 0.15).sort((a, b) => s.share[b.word] - s.share[a.word]).slice(0, 2).map((w) => w.word);

/** The gap the page leads with: a rival "wins" only on a word you aren't already praised for, so the page never contradicts itself. */
export function headlineGap(you: Scores, rivals: { brand: string; scores: Scores }[], words: PerceptionWord[]): Gap | null {
  const praised = enough(you) ? topGood(you, words) : [];
  return biggestGap(you, rivals, words.filter((w) => !praised.includes(w.word)));
}

/** The one sentence at the top of the page, in two parts: what AI says, then what to watch. */
export function verdict(brand: string, you: Scores, rivals: { brand: string; scores: Scores }[], words: PerceptionWord[], unknown: boolean): [string, string] {
  if (!enough(you)) {
    const first = unknown ? `AI doesn't know ${brand} yet.` : `Too few answers name ${brand} yet.`;
    const r = rivals.find((x) => enough(x.scores));
    const t = r ? topGood(r.scores, words) : [];
    return [first, r && t.length ? `${r.brand} is seen as ${and(t)}.` : ""];
  }
  const t = topGood(you, words);
  const first = t.length ? `AI sees ${brand} as ${and(t)}.` : `AI rarely praises ${brand}.`;
  const bad = topBad(you, words);
  const gap = headlineGap(you, rivals, words);
  if (bad && bad.share >= 0.4) return [first, `Watch ${bad.word}.`];
  if (gap && gap.them - gap.you >= 0.1) return [first, `${gap.brand} wins on ${gap.word}.`];
  return [first, bad ? `Watch ${bad.word}.` : ""];
}

/** A direct answer that says the model doesn't know the brand. */
export const NOT_KNOWN = /\b(i\s+(?:don't|do not)\s+(?:know|have (?:reliable|any) information)|not familiar with|no (?:reliable )?information (?:about|on)|i'm not aware of|i am not aware of)\b/i;

/** True when at least half the "describe" answers say the model doesn't know the brand. */
export function unknownTo(reads: PerceptionRead[], brand: string): boolean {
  const direct = reads.filter((r) => r.source === "direct" && r.named === brand && r.kind === "describe");
  return direct.length > 0 && direct.filter((r) => r.unknown).length / direct.length >= 0.5;
}
