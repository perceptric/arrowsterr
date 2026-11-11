// Content Map (docs/content-map.md): the brand's topics as bubbles grouped into pillars. Pure, so the worker, the
// screen and the tests share one copy.
//   covered:  a page of the brand ranks in Google's top 20 for it
//   overlap:  two of the brand's pages rank for the same topic and compete
//   progress: on the Content Plan with a brief or a draft under way
//   missing:  rivals rank for it in the top 10 and the brand doesn't, or it's planned and not started

import { keyWords, pageKeyOf } from "./pageWords.ts";

export type TopicStatus = "covered" | "overlap" | "progress" | "missing";
export type Topic = {
  id: string;
  name: string; // the keyword with the most searches
  keywords: string[];
  volume: number;
  traffic: number; // the brand's estimated visits from it
  status: TopicStatus;
  urls: string[]; // the brand's pages for it (two for overlap)
  rivals: string[]; // rival sites that rank for it
  planned: boolean; // on the Content Plan
  ai: boolean; // AI answers name the brand for prompts on it
  pillar: string;
  linked: boolean | null; // the pillar's main page links here; null when not checked or not a page yet
};
export type ContentMap = { pillars: { name: string; hub: string | null }[]; topics: Topic[]; rivals: string[]; at: string };

export type RankedKw = { keyword: string; volume: number | null; url?: string | null; rank?: number | null; etv?: number | null };
export type PlanItem = { keyword: string; status: "planned" | "brief" | "writing" | "published"; url?: string | null; volume?: number | null };

/** How alike two phrases are: shared meaningful words over all of them, 0 to 1. */
export function similar(a: string, b: string): number {
  const x = new Set(keyWords(a));
  const y = new Set(keyWords(b));
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}
const SAME_TOPIC = 0.6;

const byVolume = (a: RankedKw, b: RankedKw) => (b.volume ?? 0) - (a.volume ?? 0) || a.keyword.localeCompare(b.keyword);

/** Keywords grouped by the page that ranks for them: one page, one topic. */
function groupByPage(kws: RankedKw[], maxRank: number): { url: string; kws: RankedKw[] }[] {
  const by = new Map<string, { url: string; kws: RankedKw[] }>();
  for (const k of kws) {
    if (!k.url || (k.rank ?? 99) > maxRank) continue;
    const key = pageKeyOf(k.url);
    const g = by.get(key) ?? { url: k.url, kws: [] };
    g.kws.push(k);
    by.set(key, g);
  }
  return [...by.values()].map((g) => ({ url: g.url, kws: g.kws.sort(byVolume) }));
}

const sum = (kws: RankedKw[], f: (k: RankedKw) => number | null | undefined) => Math.round(kws.reduce((s, k) => s + (f(k) ?? 0), 0));

/**
 * Every topic, before pillars and links. Covered topics come from the brand's ranked pages; two pages whose main
 * keywords mean the same thing become one "overlap" topic. Missing topics are rival pages ranking top 10 for keywords
 * the brand doesn't rank top 20 for. The Content Plan marks topics planned or in progress, and adds the ones it has.
 */
export function buildTopics(brand: RankedKw[], rivals: { rival: string; kws: RankedKw[] }[], plan: PlanItem[], max = 60): Topic[] {
  const topics: Topic[] = [];
  let n = 0;
  const make = (t: Omit<Topic, "id" | "pillar" | "linked" | "ai">): Topic => ({ ...t, id: `t${++n}`, pillar: "", linked: null, ai: false });

  for (const g of groupByPage(brand, 20)) {
    const name = g.kws[0].keyword;
    const twin = topics.find((t) => similar(t.name, name) >= SAME_TOPIC);
    if (twin) {
      twin.status = "overlap";
      twin.urls.push(g.url);
      twin.keywords = [...new Set([...twin.keywords, ...g.kws.slice(0, 5).map((k) => k.keyword)])].slice(0, 8);
      twin.volume += sum(g.kws, (k) => k.volume);
      twin.traffic += sum(g.kws, (k) => k.etv);
      continue;
    }
    topics.push(make({ name, keywords: g.kws.slice(0, 5).map((k) => k.keyword), volume: sum(g.kws, (k) => k.volume), traffic: sum(g.kws, (k) => k.etv), status: "covered", urls: [g.url], rivals: [], planned: false }));
  }

  const mine = new Set(brand.filter((k) => (k.rank ?? 99) <= 20).map((k) => k.keyword.toLowerCase()));
  for (const { rival, kws } of rivals) {
    const open = kws.filter((k) => (k.volume ?? 0) >= 30 && !mine.has(k.keyword.toLowerCase()));
    for (const g of groupByPage(open, 10)) {
      const name = g.kws[0].keyword;
      const hit = topics.find((t) => similar(t.name, name) >= SAME_TOPIC || t.keywords.some((k) => similar(k, name) >= 0.8));
      if (hit) {
        if (!hit.rivals.includes(rival)) hit.rivals.push(rival);
        continue;
      }
      topics.push(make({ name, keywords: g.kws.slice(0, 5).map((k) => k.keyword), volume: sum(g.kws, (k) => k.volume), traffic: 0, status: "missing", urls: [], rivals: [rival], planned: false }));
    }
  }

  for (const p of plan) {
    const hit = topics.find((t) => similar(t.name, p.keyword) >= SAME_TOPIC || t.keywords.some((k) => k.toLowerCase() === p.keyword.toLowerCase()));
    const going = p.status === "brief" || p.status === "writing";
    if (hit) {
      hit.planned = true;
      if (hit.status === "missing" && going) hit.status = "progress";
      continue;
    }
    if (p.status === "published" && p.url) topics.push(make({ name: p.keyword, keywords: [p.keyword], volume: p.volume ?? 0, traffic: 0, status: "covered", urls: [p.url], rivals: [], planned: true }));
    else topics.push(make({ name: p.keyword, keywords: [p.keyword], volume: p.volume ?? 0, traffic: 0, status: going ? "progress" : "missing", urls: [], rivals: [], planned: true }));
  }

  // Keep the biggest topics: half the room for what the brand has, half for what it lacks, so neither crowds out the other.
  const have = topics.filter((t) => t.status === "covered" || t.status === "overlap").sort((a, b) => b.traffic - a.traffic || b.volume - a.volume);
  const lack = topics.filter((t) => t.status === "missing" || t.status === "progress").sort((a, b) => Number(b.planned) - Number(a.planned) || b.volume - a.volume);
  const half = Math.ceil(max / 2);
  const keepHave = have.slice(0, Math.max(half, max - lack.length));
  return [...keepHave, ...lack.slice(0, max - keepHave.length)];
}

/**
 * Pillars without Claude: each topic joins the meaningful word it shares with the most other topics. Topics that
 * share nothing go to "Other". Pillar names are that word, capitalized.
 */
export function fallbackPillars(topics: Pick<Topic, "id" | "name" | "keywords">[], max = 8): Map<string, string> {
  const wordsOf = (t: Pick<Topic, "name" | "keywords">) => new Set(keyWords([t.name, ...t.keywords.slice(0, 3)].join(" ")));
  const sets = topics.map((t) => ({ id: t.id, w: wordsOf(t) }));
  const count = new Map<string, number>();
  for (const s of sets) for (const w of s.w) count.set(w, (count.get(w) ?? 0) + 1);
  const picked = [...count.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([w]) => w);
  const out = new Map<string, string>();
  for (const s of sets) {
    const w = picked.find((p) => s.w.has(p));
    out.set(s.id, w ? w.charAt(0).toUpperCase() + w.slice(1) : "Other");
  }
  return out;
}

/** Use Claude's grouping when it names every topic once in at most `max` pillars; otherwise the fallback. */
export function pillarsFrom(topics: Pick<Topic, "id" | "name" | "keywords">[], claude: { pillars?: { name?: unknown; topics?: unknown }[] } | null, max = 8): Map<string, string> {
  const ids = new Set(topics.map((t) => t.id));
  const out = new Map<string, string>();
  const groups = Array.isArray(claude?.pillars) ? claude!.pillars! : [];
  if (groups.length && groups.length <= max) {
    for (const g of groups) {
      const name = String(g.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (!name) continue;
      for (const id of Array.isArray(g.topics) ? g.topics : []) if (ids.has(String(id)) && !out.has(String(id))) out.set(String(id), name);
    }
    if (out.size === ids.size) return out;
  }
  return fallbackPillars(topics, max);
}

/** AI names the brand for a topic when a prompt on it (mostly the same words) had the brand in its answer. */
export function aiNamed(topic: Pick<Topic, "name" | "keywords">, prompts: { prompt: string; named: boolean }[]): boolean {
  return prompts.some((p) => p.named && [topic.name, ...topic.keywords.slice(0, 3)].some((k) => {
    const want = keyWords(k);
    if (!want.length) return false;
    const have = new Set(keyWords(p.prompt));
    return want.filter((w) => have.has(w)).length / want.length >= 0.75;
  }));
}

/** The pillar's main page: its covered topic with the most visits. */
export function hubOf(topics: Topic[], pillar: string): Topic | null {
  return topics.filter((t) => t.pillar === pillar && t.urls.length && (t.status === "covered" || t.status === "overlap")).sort((a, b) => b.traffic - a.traffic || b.volume - a.volume)[0] ?? null;
}

/** Which of these pages the hub page links to, from the links in its HTML (as addresses, already absolute). */
export function linkedFrom(hrefs: string[], urls: string[]): Set<string> {
  const have = new Set(hrefs.map(pageKeyOf));
  return new Set(urls.filter((u) => have.has(pageKeyOf(u))));
}

export type Node = { id: string; x: number; y: number; r: number; pillar: boolean; label: string };

/**
 * Bubble positions: pillars in a grid (up to 3 a row), their topics on one or two rings around them. Bubble size
 * follows searches. Pure, so the screen and the tests agree; everything stays inside the returned width and height.
 */
export function layout(m: Pick<ContentMap, "pillars" | "topics">): { w: number; h: number; nodes: Node[] } {
  const cols = Math.min(3, Math.max(1, m.pillars.length));
  const cellW = 340;
  const cellH = 320;
  const rows = Math.max(1, Math.ceil(m.pillars.length / cols));
  const nodes: Node[] = [];
  const size = (v: number) => Math.max(7, Math.min(24, 6 + Math.sqrt(Math.max(0, v)) / 5));
  m.pillars.forEach((p, i) => {
    const cx = cellW * (i % cols) + cellW / 2;
    const cy = cellH * Math.floor(i / cols) + cellH / 2;
    nodes.push({ id: `p:${p.name}`, x: cx, y: cy, r: 26, pillar: true, label: p.name });
    const list = m.topics.filter((t) => t.pillar === p.name).sort((a, b) => b.volume - a.volume);
    const inner = list.slice(0, 9);
    const outer = list.slice(9); // every topic is drawn; past 21 the outer ring just gets tighter
    inner.forEach((t, k) => {
      const a = -Math.PI / 2 + (k / Math.max(1, inner.length)) * Math.PI * 2;
      nodes.push({ id: t.id, x: cx + Math.cos(a) * 92, y: cy + Math.sin(a) * 82, r: Math.min(size(t.volume), 18), pillar: false, label: t.name });
    });
    outer.forEach((t, k) => {
      const a = -Math.PI / 2 + ((k + 0.5) / Math.max(1, outer.length)) * Math.PI * 2;
      nodes.push({ id: t.id, x: cx + Math.cos(a) * 142, y: cy + Math.sin(a) * 124, r: Math.min(size(t.volume), outer.length > 12 ? 8 : 12), pillar: false, label: t.name });
    });
  });
  return { w: cellW * cols, h: cellH * rows, nodes };
}

export function mapStats(topics: Topic[]) {
  const n = (s: TopicStatus) => topics.filter((t) => t.status === s).length;
  return { topics: topics.length, covered: n("covered"), overlap: n("overlap"), progress: n("progress"), missing: n("missing"), ai: topics.filter((t) => t.ai).length, unlinked: topics.filter((t) => t.linked === false).length };
}
