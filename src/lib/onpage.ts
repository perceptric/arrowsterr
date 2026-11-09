// On-page Audit scoring (docs/onpage-audit.md). Pure, so the screen, the worker and the tests share one copy.
// A page is scored against the pages Google ranks in the top 10 for its keyword. Checks that need the top 10 are
// left out when fewer than MIN_COMPARE of those pages could be read, so a thin comparison never moves the score.

import { answerReady, type PageFacts } from "./freeChecks.ts";

export type Area = "keyword" | "content" | "technical" | "ai" | "links";
export type Status = "pass" | "warn" | "fail" | "unknown";
export type FixPlay = "meta" | "schema" | "faq" | "alt" | "links";
export type Check = { id: string; area: Area; label: string; status: Status; detail: string; fix: FixPlay | null; weight: number };

/** What we read from a page beyond PageFacts (onpageRead.ts). */
export type Extras = { url: string; path: string; h1Text: string; images: number; noAlt: number; internalLinks: number; externalLinks: number; canonical: string | null; noindex: boolean };
export type PageRead = PageFacts & Extras;
export type Speed = { lcpMs: number | null; score: number | null } | null;
export type Term = { term: string; page: number; top: number; pages: number };
export type Baseline = { read: number; words: number; subheadings: number; tables: number; lists: number; faq: number; terms: Term[]; compare: boolean };

export const AREAS: { id: Area; label: string; weight: number }[] = [
  { id: "keyword", label: "Keyword use", weight: 25 },
  { id: "content", label: "Content depth", weight: 30 },
  { id: "technical", label: "Technical", weight: 20 },
  { id: "ai", label: "AI answer-ready", weight: 15 },
  { id: "links", label: "Links", weight: 10 },
];
/** Fewer top pages than this and the comparison checks are skipped. */
export const MIN_COMPARE = 3;

const STOP = new Set(
  "a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just let like make many may me might more most much must my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up us very was we well were what when where which while who whom why will with would you your yours get got one two use used using way new best top also every need want see go going really thing things lot lots per via vs etc yes don't can't it's you're we're they're isn't aren't doesn't didn't won't".split(
    " ",
  ),
);

/** Lowercase words without stopwords, so "the best CRM" and "best CRMs" read alike. */
export const words = (s: string) => (s.toLowerCase().match(/[a-z0-9][a-z0-9'-]*[a-z0-9]|[a-z]/g) ?? []).map((w) => w.replace(/'s$/, ""));
/** A light stem so plurals match: "pipelines" and "pipeline", "boxes" and "box", "companies" and "company". */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (/(x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
/** The meaningful words of a phrase, stemmed, without stopwords. */
export const keyWords = (keyword: string) => [...new Set(words(keyword).filter((w) => !STOP.has(w)).map(stem))];

/** Share of the keyword's words (stopwords aside) found in a piece of text, 0 to 1. */
export function keywordShare(keyword: string, text: string): number {
  const want = keyWords(keyword);
  if (!want.length) return 1;
  const have = new Set(words(text.replace(/[-_/]/g, " ")).map(stem));
  return want.filter((w) => have.has(w)).length / want.length;
}

/** Counts of single words (4 letters or more) and two-word phrases in a text, stopwords left out. */
export function termCounts(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const list = words(text);
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (STOP.has(w) || /^\d+$/.test(w)) continue;
    if (w.length >= 4) out.set(w, (out.get(w) ?? 0) + 1);
    const n = list[i + 1];
    if (n && !STOP.has(n) && !/^\d+$/.test(n)) out.set(`${w} ${n}`, (out.get(`${w} ${n}`) ?? 0) + 1);
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Single words that show up on nearly every page and say nothing about the topic. */
const GENERIC = new Set(
  "business businesses information company companies people person time times team teams help helps helping work works working provide provides including include includes example examples different important able based without within across often even still first great good right find take know part keep give look today year years day days page pages read learn less high level levels want needs process processes system systems tool tools option options feature features service services product products customer customers user users data value values number numbers type types result results support allow allows platform solution solutions many able across overall various specific improve improves increase manage manages create creates build builds ensure understand offer offers better".split(
    " ",
  ),
);

/**
 * Terms most of the top pages use, with how often this page uses them. Two-word phrases come first: a phrase
 * counts when at least 40% of the read top pages (and at least MIN_COMPARE) use it, a single word only when 60% do
 * and it isn't a generic word. Plurals count as one term. Terms made only of the keyword's own words are left out,
 * and a word inside a picked phrase isn't listed again.
 */
export function topTerms(keyword: string, pageText: string, topTexts: string[], max = 15): Term[] {
  if (topTexts.length < MIN_COMPARE) return [];
  const fold = (t: string) => t.split(" ").map(stem).join(" ");
  // Counts per document by folded term, and the spelling the top pages use most for each.
  const spell = new Map<string, Map<string, number>>();
  const docs = topTexts.map((text) => {
    const out = new Map<string, number>();
    for (const [t, c] of termCounts(text)) {
      const k = fold(t);
      out.set(k, (out.get(k) ?? 0) + c);
      const m = spell.get(k) ?? new Map<string, number>();
      m.set(t, (m.get(t) ?? 0) + c);
      spell.set(k, m);
    }
    return out;
  });
  const mine = new Map<string, number>();
  for (const [t, c] of termCounts(pageText)) mine.set(fold(t), (mine.get(fold(t)) ?? 0) + c);
  const phraseNeed = Math.max(MIN_COMPARE, Math.ceil(docs.length * 0.4));
  const wordNeed = Math.max(MIN_COMPARE, Math.ceil(docs.length * 0.6));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const kw = new Set(keyWords(keyword));
  const isPhrase = (t: string) => t.includes(" ");
  const cands = [...df.entries()]
    .filter(([t, n]) => {
      const parts = t.split(" ");
      if (parts.every((w) => kw.has(w))) return false;
      if (isPhrase(t)) return n >= phraseNeed && !parts.every((w) => GENERIC.has(w) || kw.has(w));
      return n >= wordNeed && !GENERIC.has(t) && ![...GENERIC].some((g) => stem(g) === t);
    })
    .map(([t, n]) => {
      const name = [...(spell.get(t) ?? new Map([[t, 1]])).entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { term: name, key: t, pages: n, top: Math.round((docs.reduce((s, d) => s + (d.get(t) ?? 0), 0) / docs.length) * 10) / 10, page: mine.get(t) ?? 0 };
    })
    .sort((a, b) => Number(isPhrase(b.key)) - Number(isPhrase(a.key)) || b.pages - a.pages || b.top - a.top || a.term.localeCompare(b.term));
  const out: (Term & { key: string })[] = [];
  const words = cands.filter((c) => !isPhrase(c.key));
  for (const c of [...cands.filter((x) => isPhrase(x.key)).slice(0, Math.max(0, max - Math.min(5, words.length))), ...words]) {
    if (out.length >= max) break;
    if (!isPhrase(c.key) && out.some((o) => o.key.split(" ").includes(c.key))) continue;
    out.push(c);
  }
  return out.map(({ key, ...t }) => (void key, t));
}

/** What the read top pages look like, for the comparison checks. */
export function baseline(keyword: string, page: PageRead, top: PageRead[]): Baseline {
  const compare = top.length >= MIN_COMPARE;
  return {
    read: top.length,
    compare,
    words: median(top.map((p) => p.words)),
    subheadings: median(top.map((p) => p.subheadings)),
    tables: top.filter((p) => p.tables > 0).length,
    lists: top.filter((p) => p.lists > 0).length,
    faq: top.filter((p) => p.faq).length,
    terms: compare ? topTerms(keyword, page.text, top.map((p) => p.text)) : [],
  };
}

const ANSWER_SCHEMA = /^(Article|BlogPosting|NewsArticle|FAQPage|HowTo|Product|QAPage|Organization|LocalBusiness|SoftwareApplication|Service|WebPage|Recipe|Review|ItemList)$/i;
const n = (x: number) => x.toLocaleString("en-US");

/** Every check for one page against the baseline. */
export function checksFor(keyword: string, p: PageRead, b: Baseline, speed: Speed): Check[] {
  const c: Check[] = [];
  const add = (area: Area, id: string, weight: number, label: string, status: Status, detail: string, fix: FixPlay | null = null) => c.push({ id, area, weight, label, status, detail, fix });
  const share = (t: string) => keywordShare(keyword, t);
  const kwStatus = (s: number, softFail = false): Status => (s >= 1 ? "pass" : s >= 0.5 || softFail ? "warn" : "fail");

  // Keyword use
  add("keyword", "kw_title", 3, "Keyword in the title", p.title ? kwStatus(share(p.title)) : "fail", p.title ? `“${p.title}”` : "The page has no title.", "meta");
  add("keyword", "kw_h1", 2, "Keyword in the H1", p.h1Text ? kwStatus(share(p.h1Text)) : "fail", p.h1Text ? `“${p.h1Text}”` : "The page has no H1.");
  add("keyword", "kw_intro", 2, "Keyword in the opening paragraph", p.firstParagraph ? kwStatus(share(p.firstParagraph)) : "fail", p.firstParagraph ? "Checked the first paragraph." : "No opening paragraph found.");
  add("keyword", "kw_desc", 1, "Keyword in the meta description", p.description ? kwStatus(share(p.description), true) : "fail", p.description ? `${p.description.length} characters.` : "No meta description.", "meta");
  add("keyword", "kw_url", 1, "Keyword in the address", kwStatus(share(p.path), true), p.path || "/");

  // Content depth, against the top 10
  const skip = (area: Area, id: string, weight: number, label: string) => add(area, id, weight, label, "unknown", `Only ${b.read} of the top pages could be read.`);
  if (b.compare) {
    const ratio = b.words ? p.words / b.words : 1;
    add("content", "length", 3, "Length against the top 10", ratio >= 0.8 ? "pass" : ratio >= 0.5 ? "warn" : "fail", `${n(p.words)} words. The top 10 median is ${n(Math.round(b.words))}.`);
    const covered = b.terms.filter((t) => t.page > 0).length;
    const cov = b.terms.length ? covered / b.terms.length : 1;
    add("content", "terms", 3, "Terms the top pages use", cov >= 0.7 ? "pass" : cov >= 0.4 ? "warn" : "fail", b.terms.length ? `Uses ${covered} of ${b.terms.length} terms most top pages share.` : "No shared terms found.");
    add("content", "headings", 1, "Sections", p.subheadings >= Math.max(2, b.subheadings * 0.6) ? "pass" : "warn", `${p.subheadings} subheadings. The top 10 median is ${Math.round(b.subheadings)}.`);
    add("content", "tables", 1, "Tables", p.tables > 0 || b.tables * 2 < b.read ? "pass" : "warn", `${b.tables} of ${b.read} top pages have a table. This page has ${p.tables}.`);
    add("content", "lists", 1, "Lists", p.lists > 0 || b.lists * 2 < b.read ? "pass" : "warn", `${b.lists} of ${b.read} top pages have lists. This page has ${p.lists}.`);
    add("content", "faq", 1, "FAQ section", p.faq || b.faq * 5 < b.read * 2 ? "pass" : "warn", `${b.faq} of ${b.read} top pages answer questions in an FAQ.`, "faq");
  } else {
    skip("content", "length", 3, "Length against the top 10");
    skip("content", "terms", 3, "Terms the top pages use");
    skip("content", "headings", 1, "Sections");
  }

  // Technical
  const tl = p.title.length;
  add("technical", "title_len", 2, "Title length", !tl ? "fail" : tl >= 30 && tl <= 60 ? "pass" : "warn", tl ? `${tl} characters. Best between 30 and 60.` : "No title.", "meta");
  const dl = p.description.length;
  add("technical", "desc_len", 2, "Meta description length", !dl ? "fail" : dl >= 70 && dl <= 160 ? "pass" : "warn", dl ? `${dl} characters. Best between 120 and 155.` : "No meta description.", "meta");
  add("technical", "h1_count", 1, "One H1", p.h1 === 1 ? "pass" : p.h1 === 0 ? "fail" : "warn", `${p.h1} H1 heading${p.h1 === 1 ? "" : "s"}.`);
  const schema = p.schemaTypes.filter((t) => ANSWER_SCHEMA.test(t));
  add("technical", "schema", 2, "Structured data", schema.length ? "pass" : "fail", schema.length ? `Schema: ${schema.slice(0, 4).join(", ")}.` : "No schema found.", "schema");
  add("technical", "alt", 1, "Image alt text", p.noAlt === 0 ? "pass" : p.noAlt * 2 > p.images ? "fail" : "warn", p.images ? `${p.noAlt} of ${p.images} images have no alt text.` : "No images.", p.noAlt ? "alt" : null);
  const canonElsewhere = Boolean(p.canonical && pageKeyOf(p.canonical) !== pageKeyOf(p.url));
  add("technical", "indexable", 3, "Can be indexed", p.noindex ? "fail" : canonElsewhere ? "warn" : "pass", p.noindex ? "The page says noindex." : canonElsewhere ? `Its canonical points to ${p.canonical}.` : "Indexable, canonical points to itself.");
  if (speed && speed.lcpMs !== null) add("technical", "speed", 1, "Speed on mobile", speed.lcpMs <= 2500 ? "pass" : speed.lcpMs <= 4000 ? "warn" : "fail", `Largest paint ${(speed.lcpMs / 1000).toFixed(1)}s. Best under 2.5s.`);
  else add("technical", "speed", 1, "Speed on mobile", "unknown", "Not measured.");

  // AI answer-ready: the same checks as the free AI Answer-Ready Checker
  const ai = answerReady(p).checks;
  for (const id of ["access", "server", "answer", "readable", "paragraphs", "fresh", "author"]) {
    const x = ai.find((k) => k.id === id);
    if (x) add("ai", `ai_${id}`, Math.max(1, Math.round(x.weight / 3)), x.label, x.pass ? "pass" : id === "access" || id === "server" ? "fail" : "warn", x.detail);
  }

  // Links
  add("links", "internal", 2, "Links to your other pages", p.internalLinks >= 3 ? "pass" : p.internalLinks >= 1 ? "warn" : "fail", `${p.internalLinks} links to other pages on the site.`, p.internalLinks >= 3 ? null : "links");
  add("links", "external", 1, "Links to sources", p.externalLinks >= 1 ? "pass" : "warn", `${p.externalLinks} links to other sites.`);
  return c;
}

const VALUE: Record<Exclude<Status, "unknown">, number> = { pass: 1, warn: 0.5, fail: 0 };

/** 0 to 100 per area, or null when nothing in it could be checked. */
export function areaScores(checks: Check[]): Record<Area, number | null> {
  const out = {} as Record<Area, number | null>;
  for (const a of AREAS) {
    const known = checks.filter((c) => c.area === a.id && c.status !== "unknown");
    const w = known.reduce((s, c) => s + c.weight, 0);
    out[a.id] = w ? Math.round((known.reduce((s, c) => s + c.weight * VALUE[c.status as Exclude<Status, "unknown">], 0) / w) * 100) : null;
  }
  return out;
}

/** The page's score: area scores weighted, areas with nothing checked left out. */
export function scoreOf(areas: Record<Area, number | null>): number {
  let w = 0;
  let s = 0;
  for (const a of AREAS) {
    const v = areas[a.id];
    if (v === null) continue;
    w += a.weight;
    s += a.weight * v;
  }
  return w ? Math.round(s / w) : 0;
}

/** The same address, however it's written. */
export function pageKeyOf(url: string): string {
  return url.trim().replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+(\?|$)/, "$1").toLowerCase();
}

export type TopRow = { rank: number; url: string; domain: string; title: string; read: boolean; score: number | null; words: number };
export type OnpageResult = {
  url: string;
  keyword: string;
  title: string;
  description: string;
  score: number;
  areas: Record<Area, number | null>;
  topScore: number | null;
  topAreas: Record<Area, number | null> | null;
  checks: Check[];
  terms: Term[];
  top: TopRow[];
  read: number;
  rank: number | null; // where this page ranks in the top 10, if it does
  words: number;
  medianWords: number;
  suggest: { title: string; description: string; answer: string } | null;
};

/**
 * Score a page and every readable top page the same way. The page's own entry in the top 10 is left out of the
 * comparison, so a page never competes with itself.
 */
export function audit(keyword: string, page: PageRead, serp: { rank: number; url: string; domain: string; title: string; read: PageRead | null }[], speed: Speed): Omit<OnpageResult, "suggest"> {
  const self = pageKeyOf(page.url);
  const others = serp.filter((s) => pageKeyOf(s.url) !== self);
  const read = others.filter((s) => s.read).map((s) => s.read as PageRead);
  const b = baseline(keyword, page, read);
  const checks = checksFor(keyword, page, b, speed);
  const areas = areaScores(checks);
  const topRows: TopRow[] = serp.map((s) => {
    if (!s.read) return { rank: s.rank, url: s.url, domain: s.domain, title: s.title, read: false, score: null, words: 0 };
    const sc = areaScores(checksFor(keyword, s.read, b, null));
    return { rank: s.rank, url: s.url, domain: s.domain, title: s.title, read: true, score: scoreOf(sc), words: s.read.words };
  });
  let topAreas: Record<Area, number | null> | null = null;
  let topScore: number | null = null;
  if (b.compare) {
    const each = read.map((r) => areaScores(checksFor(keyword, r, b, null)));
    topAreas = {} as Record<Area, number | null>;
    for (const a of AREAS) {
      const vals = each.map((e) => e[a.id]).filter((v): v is number => v !== null);
      topAreas[a.id] = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : null;
    }
    const scores = topRows.filter((t) => t.score !== null && pageKeyOf(t.url) !== self).map((t) => t.score as number);
    topScore = scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null;
  }
  const mine = serp.find((s) => pageKeyOf(s.url) === self);
  return {
    url: page.url,
    keyword,
    title: page.title,
    description: page.description,
    score: scoreOf(areas),
    areas,
    topScore,
    topAreas,
    checks,
    terms: b.terms,
    top: topRows,
    read: read.length,
    rank: mine?.rank ?? null,
    words: page.words,
    medianWords: Math.round(b.words),
  };
}

/** Score gain if every check with this fix passed: each fixable check's missing weight, in score points. */
export function fixGain(r: Pick<OnpageResult, "checks">, fix: FixPlay): number {
  const after = r.checks.map((c) => (c.fix === fix && c.status !== "unknown" ? { ...c, status: "pass" as const } : c));
  return Math.max(0, scoreOf(areaScores(after)) - scoreOf(areaScores(r.checks)));
}

/** Suggested title and description are kept only when they fit the length rules and use the keyword. */
export function cleanSuggest(keyword: string, s: { title?: unknown; description?: unknown; answer?: unknown } | null): OnpageResult["suggest"] {
  if (!s) return null;
  const t = String(s.title ?? "").replace(/\s+/g, " ").trim();
  const d = String(s.description ?? "").replace(/\s+/g, " ").trim();
  const a = String(s.answer ?? "").replace(/\s+/g, " ").trim();
  const ok = t.length >= 30 && t.length <= 65 && d.length >= 100 && d.length <= 165 && keywordShare(keyword, t) >= 0.5;
  if (!ok) return null;
  const aw = a.split(/\s+/).filter(Boolean).length;
  return { title: t, description: d, answer: aw >= 15 && aw <= 90 ? a : "" };
}

export type MainKeyword = { url: string; keyword: string; rank: number | null; traffic: number; volume: number | null };

/** One row per page: its keywords' visits added up, and the keyword that brings the most as its main keyword. */
export function mainKeywords(kws: { keyword: string; url?: string | null; rank?: number | null; etv?: number | null; volume: number | null }[], limit = 30): MainKeyword[] {
  const by = new Map<string, MainKeyword & { best: number }>();
  for (const k of kws) {
    if (!k.url) continue;
    const key = pageKeyOf(k.url);
    const e = k.etv ?? 0;
    const cur = by.get(key);
    if (!cur) by.set(key, { url: k.url, keyword: k.keyword, rank: k.rank ?? null, traffic: e, volume: k.volume, best: e });
    else {
      cur.traffic += e;
      if (e > cur.best) Object.assign(cur, { keyword: k.keyword, rank: k.rank ?? null, volume: k.volume, best: e });
    }
  }
  return [...by.values()]
    .sort((a, b) => b.traffic - a.traffic)
    .slice(0, limit)
    .map(({ best, ...r }) => (void best, { ...r, traffic: Math.round(r.traffic) }));
}
