// The fact audit (docs/zippie-skills-plan.md, section 2): humanizer-en's post_edit_audit.py, ported for articles.
// Editing changes wording, never content. After every rewrite this compares the text before and after, in code:
//   values     numbers, amounts, percents, dates and quoted words, as a multiset: one lost or added = BLOCK
//   links      link addresses, as a multiset: one lost or added = BLOCK
//   names      protected names (the brand, the examples, the sources): one gone = BLOCK
//   certainty  one strong hedge fewer ("likely", "may", "about 600") = BLOCK; every "many" or "often" gone = BLOCK
//   traces     chat formulas ("Here's", "I hope this helps") or fields to fill in left in = BLOCK
//   length     more than 30% of the words gone = BLOCK
// The result is OK, WARN or BLOCK, with every reason. The legal checks of the original (norms, legal terms) are left
// out: articles don't carry them. Pure.

export type AuditStatus = "OK" | "WARN" | "BLOCK";
export type Audit = { status: AuditStatus; reasons: string[] };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON = [...MONTHS, "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"].join("|");
const month = (n: string) => MONTHS.findIndex((m) => m.startsWith(n.toLowerCase().replace(/\.$/, "").slice(0, 3))) + 1;
const pad = (n: number | string) => String(n).padStart(2, "0");

/** Text compared fairly: links taken out (they're checked apart), bold marks gone, quotes and dashes made plain. */
export function norm(t: string): string {
  return t
    .normalize("NFC")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
const wordsOf = (t: string) => t.match(/\w+/g) ?? [];

const RE_QUOTE = /"([^"]{2,400})"/g;
const RE_DATE_DMY = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MON})\\.?,?\\s+(\\d{4})\\b`, "gi");
const RE_DATE_MDY = new RegExp(`\\b(${MON})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi");
const RE_DATE_ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const RE_NUM = /(?<![\d.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)|(?<![\d.,])\d+(?:\.\d+)?(?!\d)/g;

/** Every value an edit must neither lose nor add, as "kind value" strings (a multiset: repeats count). */
export function values(text: string): string[] {
  let t = norm(text);
  const found: string[] = [];
  const mask = (re: RegExp, f: (m: RegExpExecArray) => string) => {
    t = t.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      found.push(f(m));
      return " \u0000 ";
    });
  };
  mask(RE_QUOTE, (m) => `quote ${m[1].toLowerCase()}`);
  mask(RE_DATE_DMY, (m) => `date ${m[3]}-${pad(month(m[2]))}-${pad(m[1])}`);
  mask(RE_DATE_MDY, (m) => `date ${m[3]}-${pad(month(m[1]))}-${pad(m[2])}`);
  mask(RE_DATE_ISO, (m) => `date ${m[0]}`);
  for (const m of t.matchAll(RE_NUM)) found.push(`number ${m[0].replace(/,/g, "").replace(/\.0+$/, "")}`);
  return found;
}

/** Link addresses in a markdown text, as a multiset. */
export const links = (t: string) => [...t.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1].replace(/\/+$/, ""));

// Strong hedges carry the claim's certainty: one fewer is a stronger claim. "about" and the like count only before a
// number ("about 600 km"), since "talk about" hedges nothing.
const RE_STRONG = /(?<![A-Za-z])(?:likely|unlikely|probabl\w*|possibl[ey]|perhaps|presumabl[ey]|provisional\w*|preliminar\w*|tentativ\w*|potentially|estimated|unclear|it appears|appears? to|seems?|might|may|could|(?:approximately|roughly|about|around|nearly|almost|up to|over|more than|less than|at least)(?=\s+[$€£]?\d))(?![A-Za-z])/gi;
// Weak ones soften a whole group ("many teams"): all of them gone is a stronger claim.
const RE_WEAK = /(?<![A-Za-z])(?:typically|usually|often|generally|sometimes|in most cases|some|many|most|can vary|varies)(?![A-Za-z])/gi;
export const uncertainty = (t: string) => ({ strong: (norm(t).match(RE_STRONG) ?? []).length, weak: (norm(t).match(RE_WEAK) ?? []).length });

const RE_TRACE = /^\s*(?:here's|here is|here are|certainly[!,.]|sure[!,.]|of course[!,.]|great question|absolutely[!,.])|(?:i\s+)?hope\s+(?:this|that|it)\s+helps|let\s+me\s+know\s+if\s+you|would\s+you\s+like\s+me\s+to|as\s+an?\s+(?:ai|language\s+model)|\[(?:insert|todo|tbd|placeholder)[^\]]*\]|\{\{[^}]{1,60}\}\}/i;

/** Multiset difference: what's in a and not in b, as "value" lines. */
function minus(a: string[], b: string[]): string[] {
  const left = new Map<string, number>();
  for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  const out: string[] = [];
  for (const x of a) {
    const n = left.get(x) ?? 0;
    if (n) left.set(x, n - 1);
    else out.push(x);
  }
  return out;
}

/**
 * Compare a text before and after an edit. names: protected names that must not disappear (the brand, example names,
 * source names). maxCut: the share of words that may go (0.3).
 */
export function factAudit(before: string, after: string, opts: { names?: string[]; maxCut?: number } = {}): Audit {
  const a = norm(before);
  const b = norm(after);
  const reasons: string[] = [];
  let status: AuditStatus = "OK";
  const block = (r: string) => {
    reasons.push(r);
    status = "BLOCK";
  };
  const warn = (r: string) => {
    reasons.push(r);
    if (status === "OK") status = "WARN";
  };
  if (!b && a) {
    block("the text is empty after the edit");
    return { status, reasons };
  }
  // Unchanged words with unchanged links: nothing to check. (norm takes links out, so they're compared too.)
  if (a === b && links(before).join(" ") === links(after).join(" ")) return { status, reasons };

  const va = values(before);
  const vb = values(after);
  const lost = minus(va, vb);
  const added = minus(vb, va);
  if (lost.length) block(`lost ${lost.join("; ")}`);
  if (added.length) block(`added ${added.join("; ")}`);

  const la = links(before);
  const lb = links(after);
  const lostLinks = minus(la, lb);
  const addedLinks = minus(lb, la);
  if (lostLinks.length) block(`lost link ${lostLinks.join(", ")}`);
  if (addedLinks.length) block(`added link ${addedLinks.join(", ")}`);

  for (const n of opts.names ?? []) {
    const name = n.trim();
    if (name.length < 2) continue;
    const re = new RegExp(`(?<![A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`, "i");
    if (re.test(a) && !re.test(b)) block(`lost the name "${name}"`);
  }

  const ua = uncertainty(before);
  const ub = uncertainty(after);
  if (ub.strong < ua.strong) block(`a hedge is gone ("likely", "may", "about" before a number and the like: ${ua.strong} to ${ub.strong}), so a claim got stronger`);
  else if (ua.weak && !ub.weak) block(`every softener is gone ("many", "often", "usually": ${ua.weak} to 0), so a claim got stronger`);
  else if (ub.strong > ua.strong) warn(`hedges added (${ua.strong} to ${ub.strong})`);

  if (RE_TRACE.test(b) && !RE_TRACE.test(a)) block("a chat formula or a field to fill in was added");

  const na = wordsOf(a).length;
  const nb = wordsOf(b).length;
  const cut = na ? (na - nb) / na : 0;
  if (na >= 12 && cut > (opts.maxCut ?? 0.3)) block(`${Math.round(cut * 100)}% of the words are gone`);

  return { status, reasons };
}
