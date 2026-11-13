// Draft and Write, Phase 0 (docs/draft-and-write-build.md): what we measure on every article the writer makes for
// the 20 recorded topics. Today's writer sets the baseline; each later phase has to beat it.
// Pure: an article's sections and the research behind it in, numbers out.
import { lintDraft } from "./houseRules.ts";
import type { ResearchPack } from "./writerBrief.ts";
import type { Section } from "./writerDraft.ts";

export type Score = {
  words: number;
  sections: number;
  /** House rule findings left in the finished text, in total and by rule. */
  lint: number;
  lintRules: Record<string, number>;
  /** Numbers with a currency sign or a percent, or of three digits and more (years left out), and those the research doesn't have. */
  numbers: number;
  unsourced: string[];
  /** Links in the text, and those that are neither a source page nor one of the brand's own pages. */
  links: number;
  strayLinks: string[];
  images: number;
  modules: number;
};

const blockText = (b: Section["blocks"][number]) => [b.text, ...b.items, ...b.rows.flat()].filter(Boolean).join(" ");
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*?/g, "");

/** The numbers that need a source: money, percents and numbers of three digits and more, without years. */
export function checkedNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of plain(text).replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/[$€£]\s?\d+(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\b\d{3,}(?:\.\d+)?\b/g)) {
    const n = m[0].replace(/[$€£%\s]/g, "").replace(/\.0+$/, "");
    if (/^(19|20)\d\d$/.test(n) && !/[$€£%]/.test(m[0])) continue; // a year
    out.push(n);
  }
  return out;
}

/** Every number in a text, written the same way (no thousands commas, no trailing .0). */
const allNumbers = (text: string) => new Set([...text.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0].replace(/\.0+$/, "")));

/** All the research text a fact may come from. */
export const researchText = (pack: ResearchPack) =>
  [...pack.pages.map((p) => p.body), ...pack.questions.flatMap((q) => [q.question, q.answer ?? ""]), pack.aiOverview, ...pack.answers.map((a) => a.text)].join("\n");

const urlKey = (u: string) => u.replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();

export function scoreArticle(
  sections: Section[],
  pack: ResearchPack,
  opts: { sitemap?: string[]; brandDomain?: string; examples?: { name: string }[]; images?: number; modules?: number } = {},
): Score {
  const text = sections.map((s) => [s.h2, ...s.blocks.map(blockText)].join("\n")).join("\n");
  const words = plain(text).split(/\s+/).filter(Boolean).length;
  const findings = lintDraft(sections, opts.examples ?? []);
  const lintRules: Record<string, number> = {};
  for (const f of findings) lintRules[f.rule] = (lintRules[f.rule] ?? 0) + 1;
  const have = allNumbers(researchText(pack));
  const nums = checkedNumbers(text);
  const allowed = new Set([...pack.pages.map((p) => urlKey(p.url)), ...(opts.sitemap ?? []).map(urlKey)]);
  const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const own = (u: string) => Boolean(opts.brandDomain) && urlKey(u).startsWith(opts.brandDomain!.replace(/^www\./, "").toLowerCase());
  return {
    words,
    sections: sections.length,
    lint: findings.length,
    lintRules,
    numbers: nums.length,
    unsourced: [...new Set(nums.filter((n) => !have.has(n)))],
    links: links.length,
    strayLinks: [...new Set(links.filter((u) => !allowed.has(urlKey(u)) && !own(u)))],
    images: opts.images ?? 0,
    modules: opts.modules ?? 0,
  };
}

/** Totals across topics, for the baseline table. */
export function sumScores(list: Score[]) {
  const n = list.length || 1;
  const total = (f: (s: Score) => number) => list.reduce((a, s) => a + f(s), 0);
  return {
    articles: list.length,
    wordsAvg: Math.round(total((s) => s.words) / n),
    lintPerArticle: Math.round((total((s) => s.lint) / n) * 10) / 10,
    unsourcedNumbers: total((s) => s.unsourced.length),
    checkedNumbers: total((s) => s.numbers),
    strayLinks: total((s) => s.strayLinks.length),
    imagesAvg: Math.round((total((s) => s.images) / n) * 10) / 10,
    modulesAvg: Math.round((total((s) => s.modules) / n) * 10) / 10,
  };
}
