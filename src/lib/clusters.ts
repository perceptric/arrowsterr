// Opportunities: pages grouped into clusters, a pillar for each, and a score for every page
// (docs/content-v3-backend.md, section 2). Pure, shared by the plan job and the tests: the same input
// always gives the same clusters.

import type { Stage } from "./research";

export const CLUSTER_CAP = 12; // pages in one cluster at most
export const NOISE_SHARE = 0.4; // a link in more than this share of results joins nothing
export const NOISE_MIN_LISTS = 5; // fewer result lists than this and no link counts as noise
export const ATTACH_SHARE = 0.25; // a lone page joins a cluster in its theme when this share of its words are in that cluster
export const SAME_CLUSTER = 0.5; // a new cluster keeps an old one's id at this much keyword overlap
export const UPDATES_GROUP = "Pages to update";
export const ONE_LINK_WORDS = 0.1; // two pages sharing one link must also share this much of their words
export const PILLAR_STRENGTH = 0.5; // the pillar is picked from pages with at least this share of the top link strength
export const DOMAIN_WORDS = 0.2; // pages in one theme sharing 2 or more sites need this much word overlap
export const THEME_WORDS = 0.4; // pages in one theme with this much word overlap are linked with no shared results

const STOP = new Set(
  "a an and are as at be by can do does for from how i in is it its me my of on or our the their this to vs what when where which who why will with you your".split(" "),
);

/**
 * A link cleaned so the same page always matches: no scheme, www, query, # part or trailing slash.
 * Null for links that can't link two topics: unreadable ones, Google's own, the brand's own, home pages and
 * section pages like /blog or /guides. A home page is about a whole site, and Google often shortens a result's
 * address to its section, so both would join topics that have nothing in common.
 */
export function cleanLink(url: string, ownHost?: string | null): string | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;
  const own = ownHost?.toLowerCase().replace(/^www\./, "");
  if (own && (host === own || host.endsWith(`.${own}`))) return null;
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return null;
  let path: string;
  try {
    path = decodeURIComponent(u.pathname);
  } catch {
    path = u.pathname;
  }
  path = path.toLowerCase().replace(/(\.{3}|…)+$/, "").replace(/\/+$/, "");
  const last = path.split("/").pop() ?? "";
  // An article's address ends in a slug with a hyphen, an underscore, a number or a file ending, or a long word.
  if (!last || !(/[-_\d.]/.test(last) || last.length >= 12)) return null;
  return host + path;
}

/** Links that show in more than `share` of the result lists. Sites like Wikipedia show for everything, so they would join topics that have nothing in common. */
export function noisyLinks(lists: string[][], share = NOISE_SHARE): Set<string> {
  const out = new Set<string>();
  const filled = lists.filter((l) => l.length);
  if (filled.length < NOISE_MIN_LISTS) return out;
  const count = new Map<string, number>();
  for (const l of filled) for (const u of new Set(l)) count.set(u, (count.get(u) ?? 0) + 1);
  for (const [u, n] of count) if (n / filled.length > share) out.add(u);
  return out;
}

/** The words of a keyword, lowercased, with a trailing "s" taken off. keepStop keeps small words like "for". */
export function wordsOf(text: string, keepStop = false): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && (keepStop || !STOP.has(w)))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Share of words two lists have in common (Jaccard), 0 to 1. */
export function overlap(a: string[], b: string[]): number {
  const x = new Set(a);
  const y = new Set(b);
  if (!x.size && !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

export type ClusterPage = {
  key: string; // the page's main keyword
  keywords: string[]; // every keyword the page targets, main first
  theme: string;
  volume: number;
  update?: boolean; // a page the site already has
  links: string[]; // cleaned top-10 links of all its keywords, noise removed
  domains?: string[]; // the sites in its top 10, noise removed; defaults to the sites of its links
};
export type BuiltCluster = { pages: string[]; pillar: string; theme: string; updates?: boolean };

type Edge = { a: number; b: number; w: number; tie: string };

/** Share of a's words that are in b, 0 to 1. */
const containment = (a: string[], b: Set<string>) => {
  const x = new Set(a);
  if (!x.size) return 0;
  let n = 0;
  for (const w of x) if (b.has(w)) n++;
  return n / x.size;
};

/**
 * Links between pages, strongest first. Two pages are linked when:
 * - they share 2 or more top-10 pages, or 1 and some words; or
 * - they are in the same theme and share 2 or more sites and a fifth of their words, or 40% of their words.
 * Pages in different themes need a shared page, so the plan's themes stay apart unless Google joins them.
 * Strength = 3 × shared pages + shared sites + 4 × word overlap.
 */
export function edgesOf(pages: ClusterPage[]): Edge[] {
  const sets = pages.map((p) => new Set(p.links));
  const sites = pages.map((p) => new Set(p.domains ?? p.links.map((u) => u.split("/")[0])));
  const words = pages.map((p) => wordsOf(p.keywords.join(" ")));
  const out: Edge[] = [];
  for (let i = 0; i < pages.length; i++)
    for (let j = i + 1; j < pages.length; j++) {
      let shared = 0;
      for (const u of sets[j]) if (sets[i].has(u)) shared++;
      let common = 0;
      for (const d of sites[j]) if (sites[i].has(d)) common++;
      const o = overlap(words[i], words[j]);
      const same = pages[i].theme === pages[j].theme;
      const ok = shared >= 2 || (shared === 1 && o >= ONE_LINK_WORDS) || (same && ((common >= 2 && o >= DOMAIN_WORDS) || o >= THEME_WORDS));
      if (!ok) continue;
      const [x, y] = [pages[i].key, pages[j].key].sort();
      out.push({ a: i, b: j, w: Math.round((shared * 3 + common + o * 4) * 1000) / 1000, tie: `${x}\u0000${y}` });
    }
  return out.sort((p, q) => q.w - p.w || (p.tie < q.tie ? -1 : p.tie > q.tie ? 1 : 0));
}

/**
 * Pages into clusters (docs/content-v3-backend.md, section 2.5):
 * 1. The strongest links join first (Kruskal's method). A join that would pass `cap` pages is skipped.
 * 2. A page left alone joins the cluster in its theme that holds the most of its words (a quarter or more), if it has room.
 * 3. Pages still alone in the same theme form one cluster for that theme, `cap` at a time.
 * 4. Update pages still alone go into "Pages to update"; anything else stands alone.
 */
export function buildClusters(input: ClusterPage[], cap = CLUSTER_CAP): BuiltCluster[] {
  // Sort once so the order of the input never changes the result.
  const pages = [...input].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const edges = edgesOf(pages);
  const parent = pages.map((_, i) => i);
  const size = pages.map(() => 1);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (const e of edges) {
    const ra = root(e.a);
    const rb = root(e.b);
    if (ra === rb || size[ra] + size[rb] > cap) continue;
    const [big, small] = size[ra] >= size[rb] ? [ra, rb] : [rb, ra];
    parent[small] = big;
    size[big] += size[small];
  }
  const groups = new Map<number, number[]>();
  const lone: number[] = [];
  pages.forEach((_, i) => {
    const r = root(i);
    if (size[r] === 1) lone.push(i);
    else groups.set(r, [...(groups.get(r) ?? []), i]);
  });

  const words = pages.map((p) => wordsOf(p.keywords.join(" ")));
  const left: number[] = [];
  for (const i of lone) {
    let best: { r: number; c: number } | null = null;
    for (const [r, members] of groups) {
      if (members.length >= cap || pages[members[0]].theme !== pages[i].theme) continue;
      const c = containment(words[i], new Set(members.flatMap((m) => words[m])));
      if (c >= ATTACH_SHARE && (!best || c > best.c)) best = { r, c };
    }
    if (best) groups.get(best.r)!.push(i);
    else left.push(i);
  }

  const out: number[][] = [...groups.values()];
  const updates = left.filter((i) => pages[i].update);
  const byTheme = new Map<string, number[]>();
  for (const i of left) if (!pages[i].update) byTheme.set(pages[i].theme, [...(byTheme.get(pages[i].theme) ?? []), i]);
  for (const list of byTheme.values()) for (let k = 0; k < list.length; k += cap) out.push(list.slice(k, k + cap));

  const weight = (i: number, members: Set<number>) => edges.reduce((n, e) => n + ((e.a === i && members.has(e.b)) || (e.b === i && members.has(e.a)) ? e.w : 0), 0);
  const make = (members: number[], isUpdates = false): BuiltCluster => {
    const set = new Set(members);
    // The pillar: of the pages with at least half the top link strength, the one with the most searches.
    const w = new Map(members.map((m) => [m, weight(m, set)]));
    const top = Math.max(...w.values());
    const ranked = [...members].sort((x, y) => {
      const sx = w.get(x)! >= top * PILLAR_STRENGTH ? 1 : 0;
      const sy = w.get(y)! >= top * PILLAR_STRENGTH ? 1 : 0;
      return sy - sx || pages[y].volume - pages[x].volume || w.get(y)! - w.get(x)! || (pages[x].key < pages[y].key ? -1 : 1);
    });
    const pillar = pages[ranked[0]];
    return { pages: ranked.map((m) => pages[m].key), pillar: pillar.key, theme: isUpdates ? UPDATES_GROUP : pillar.theme, ...(isUpdates ? { updates: true } : {}) };
  };
  const built = out.map((m) => make(m));
  for (let k = 0; k < updates.length; k += cap) built.push(make(updates.slice(k, k + cap), true));
  return built;
}

/** True when a cluster name is 2 to 4 words and every word comes from the cluster's keywords. */
export function nameOk(name: string, keywords: string[]): boolean {
  const n = wordsOf(name, true);
  if (n.length < 2 || n.length > 4) return false;
  const pool = new Set(keywords.flatMap((k) => wordsOf(k, true)));
  return n.every((w) => pool.has(w));
}

/** A cluster's name: the AI's when it passes nameOk, else the pillar keyword, first letter in capitals. */
export function clusterName(suggested: string | null | undefined, pillar: string, keywords: string[]): string {
  const s = (suggested ?? "").trim().replace(/[."]+$/g, "");
  const pick = s && nameOk(s, keywords) ? s : pillar;
  return pick.charAt(0).toUpperCase() + pick.slice(1);
}

export const STAGE_WEIGHT: Record<Stage, number> = { bofu: 3, mofu: 2, tofu: 1 };

export type ScoreInput = {
  volume: number | null;
  stage: Stage | null;
  kd: number | null;
  rank?: number | null; // the site's position for the keyword now
  gap?: boolean; // AI answers name a competitor and leave out the brand
  update?: boolean;
};

/** Chance of ranking, 0 to 0.95: easier keywords and keywords the site already ranks 4 to 20 for go up. */
export function chanceOf(kd: number | null, rank?: number | null): number {
  let c = 1 - Math.min(100, Math.max(0, kd ?? 30)) / 100;
  if (rank && rank >= 4 && rank <= 10) c *= 1.5;
  else if (rank && rank >= 11 && rank <= 20) c *= 1.25;
  return Math.min(0.95, Math.round(c * 1000) / 1000);
}

/** value × chance × AI bonus × update bonus. AI-only rows with no volume use the brand's median volume. */
export function scoreOf(p: ScoreInput, medianVolume: number): number {
  const volume = p.volume ?? medianVolume;
  const value = volume * STAGE_WEIGHT[p.stage ?? "tofu"];
  const s = value * chanceOf(p.kd, p.rank) * (p.gap ? 1.5 : 1) * (p.update ? 1.2 : 1);
  return Math.round(s * 10) / 10;
}

export function median(list: number[]): number {
  const s = list.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export type Level = "high" | "medium" | "low";

/**
 * High, Medium or Low by the brand's own thirds of its scores. With fewer than 6 rows the thirds mean little,
 * so fixed cut points on the chance are used instead.
 */
export function levelOf(score: number, all: number[], chance: number): Level {
  if (all.length < 6) return chance >= 0.6 ? "high" : chance < 0.3 ? "low" : "medium";
  const s = [...all].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const lo = at(1 / 3);
  const hi = at(2 / 3);
  return score >= hi ? "high" : score < lo ? "low" : "medium";
}

/**
 * Old cluster ids for new clusters: a new cluster takes the id of the old one whose keywords overlap most,
 * at 50% or more. Best matches go first and each old id is used once. Returns new index to old id.
 */
export function matchClusters(old: { id: string; keywords: string[] }[], fresh: { keywords: string[] }[]): Map<number, string> {
  const pairs: { i: number; id: string; o: number }[] = [];
  fresh.forEach((f, i) => {
    for (const o of old) {
      const v = overlap(f.keywords.map((k) => k.toLowerCase()), o.keywords.map((k) => k.toLowerCase()));
      if (v >= SAME_CLUSTER) pairs.push({ i, id: o.id, o: v });
    }
  });
  pairs.sort((a, b) => b.o - a.o || a.i - b.i || (a.id < b.id ? -1 : 1));
  const out = new Map<number, string>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (out.has(p.i) || used.has(p.id)) continue;
    out.set(p.i, p.id);
    used.add(p.id);
  }
  return out;
}

/** "A", "A and B", "A, B and C". */
export function listNames(names: string[]): string {
  const n = names.slice(0, 3);
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
}

/** The reason text for an AI gap, built in code from the data: "ChatGPT names Northpeak and Velora". */
export function gapReason(engine: string, competitors: string[]): string {
  return `${engine} names ${listNames(competitors)}`;
}

export type AnswerRow = { engine: string; prompt: string; names: string[]; brandNamed: boolean };
export type Gap = { prompt: string; engine: string; competitors: string[]; runs: number };

/**
 * Prompts where AI answers name a competitor in 2 or more runs and the brand in none.
 * The engine named first is the one with the most competitor mentions.
 */
export function findGaps(rows: AnswerRow[], competitors: string[], minRuns = 2): Gap[] {
  const comp = new Map(competitors.map((c) => [c.toLowerCase(), c]));
  const byPrompt = new Map<string, AnswerRow[]>();
  for (const r of rows) byPrompt.set(r.prompt, [...(byPrompt.get(r.prompt) ?? []), r]);
  const out: Gap[] = [];
  for (const [prompt, list] of byPrompt) {
    if (list.some((r) => r.brandNamed)) continue;
    const hits = list.filter((r) => r.names.some((n) => comp.has(n.toLowerCase())));
    if (hits.length < minRuns) continue;
    const perEngine = new Map<string, number>();
    const perName = new Map<string, number>();
    for (const r of hits) {
      perEngine.set(r.engine, (perEngine.get(r.engine) ?? 0) + 1);
      for (const n of new Set(r.names.map((x) => x.toLowerCase()))) if (comp.has(n)) perName.set(n, (perName.get(n) ?? 0) + 1);
    }
    const engine = [...perEngine].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
    const names = [...perName].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([n]) => comp.get(n)!);
    out.push({ prompt, engine, competitors: names.slice(0, 3), runs: hits.length });
  }
  return out.sort((a, b) => b.runs - a.runs || (a.prompt < b.prompt ? -1 : 1));
}

/** True when a gap keyword is already in the plan: 3 or more shared top-10 links, or 60% of the same words. */
export function samePlanKeyword(a: { keyword: string; links: string[] }, b: { keyword: string; links: string[] }): boolean {
  const bl = new Set(b.links);
  if (a.links.filter((u) => bl.has(u)).length >= 3) return true;
  return overlap(wordsOf(a.keyword), wordsOf(b.keyword)) >= 0.6;
}

/** A gap prompt's stage from its wording: buying words make it Buy, else Compare. */
export function gapStage(keyword: string): Stage {
  return /\b(best|top|vs|versus|alternative|alternatives|review|reviews|price|pricing|cost|buy|cheap|deal)\b/i.test(keyword) ? "bofu" : "mofu";
}
