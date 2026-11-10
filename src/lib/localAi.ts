// Local Research, phase 4 (docs/local-research-plan.md, 4.6): AI answers on the grid. Google's AI Mode is asked
// "best {keyword}" from each point of a 5 × 5 grid (DataForSEO takes the point's coordinates), and ChatGPT and Gemini
// once for the city. Businesses are matched by Google's ids and websites in the answer's links first, then by name.
// Share of AI Voice is the share of answered points whose answer names the business. Pure.

import { grid, type Location, type Place, type Shape } from "./local.ts";

export const AI_GRID = 5;
export type AiEngine = "AI Mode" | "ChatGPT" | "Gemini";
export type Candidate = { key: string; title: string; you: boolean; cid: string | null; domain: string | null };
export type Named = { key: string; title: string; you: boolean; pos: number; how: "link" | "name" };
/** One answer as saved: who it names (in order), the sites it cites, and the start of its text. */
export type AiRead = { named: Named[]; sources: string[]; shown: boolean; text: string };
/** The saved answers of a scan: grid points by number, plus "ChatGPT" and "Gemini". null means it failed. */
export type AiReads = Record<string, AiRead | null>;

export type AiBusiness = { key: string; title: string; you: boolean; share: number; points: number; avgPos: number | null; byName: boolean; chatgpt: number | null; gemini: number | null };
export type AiResult = {
  keyword: string;
  size: number;
  spacing: number;
  shape: Shape;
  center: { lat: number; lng: number };
  /** Grid points AI Mode answered for. */
  read: number;
  /** Your place in the answer at each point: a number, null when not named, undefined when the point failed. */
  pos: (number | null | undefined)[];
  share: number | null;
  avgPos: number | null;
  chatgpt: { named: boolean; pos: number | null } | null;
  gemini: { named: boolean; pos: number | null } | null;
  businesses: AiBusiness[];
  sources: { domain: string; n: number; whose: "you" | "rival" | null }[];
};

/**
 * The AI grid: 5 × 5 (or the location's grid when smaller) over the same area as the Maps grid, so the two line up at
 * the edges and the centre.
 */
export function aiGridOf(loc: Pick<Location, "lat" | "lng" | "spacing" | "size" | "shape" | "center">) {
  const full = loc.size ?? 7;
  const size = Math.min(AI_GRID, full);
  const spacing = Math.round(((loc.spacing * (full - 1)) / Math.max(1, size - 1)) * 100) / 100;
  const center = loc.center ?? { lat: loc.lat, lng: loc.lng };
  const shape: Shape = loc.shape ?? "square";
  return { center, size, shape, spacing, points: grid(center.lat, center.lng, spacing, size, shape) };
}

/** Tasks an AI grid takes: about 2 per 5 AI Mode reads, plus the two city reads. */
export const aiTasks = (points: number) => Math.max(2, Math.ceil((points * 2) / 5) + 2);

/** The question asked: "best dentist" near the point, "best dentist in Austin" for ChatGPT and Gemini. */
export function aiPrompt(keyword: string, city?: string | null): string {
  const k = keyword.trim().replace(/\s+/g, " ");
  const base = /^(best|top)\b/i.test(k) ? k : `best ${k}`;
  if (!city || /\bnear me\b/i.test(base) || base.toLowerCase().includes(city.toLowerCase())) return base;
  return `${base} in ${city}`;
}

const clean = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const bareHost = (d: string | null | undefined) => (d ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#:].*$/, "");
/** Sites many businesses share: a match on them says nothing about which business it is. */
const SHARED = /(^|\.)(google|facebook|instagram|yelp|linkedin|twitter|x|tiktok|youtube|wix|wixsite|squarespace|godaddysites|business\.site|square\.site|weebly|nextdoor|healthgrades|zocdoc|bbb|angi|thumbtack|tripadvisor|yellowpages|mapquest|apple)\.[a-z.]+$/;
const ownSite = (d: string | null | undefined) => {
  const h = bareHost(d);
  return h && !SHARED.test(h) ? h : null;
};
const LEGAL = /\b(llc|inc|pllc|pc|ltd|co|corp|dds|dmd|md|pa)\b/g;

/** The names a business goes by in an answer: its full name, and the part before " - ", " | " or ":". */
export function nameForms(title: string): string[] {
  const full = clean(title).replace(LEGAL, " ").replace(/\s+/g, " ").trim();
  const short = clean(title.split(/\s+[-–|:]\s+|\s*[|:]\s*/)[0]).replace(LEGAL, " ").replace(/\s+/g, " ").trim();
  // A name is only matched when it can't be a common word: 2 words or more, or one long word.
  return [...new Set([full, short])].filter((n) => n.split(" ").length >= 2 || n.length >= 8);
}

/** The businesses a Maps scan saw, plus the business itself, as candidates to look for in AI answers. */
export function candidatesOf(you: Pick<Location, "title" | "cid"> & { domain?: string | null }, points: Record<string, Place[] | null> | null | undefined, max = 60): Candidate[] {
  const out: Candidate[] = [{ key: "__you", title: you.title, you: true, cid: you.cid, domain: ownSite(you.domain) }];
  const seen = new Set<string>(you.cid ? [you.cid] : []);
  const youName = clean(you.title);
  const all = Object.values(points ?? {}).flatMap((list) => list ?? []);
  const best = new Map<string, Place>();
  for (const p of all) {
    const k = p.cid || p.placeId || clean(p.title);
    const had = best.get(k);
    if (!had || p.rank < had.rank) best.set(k, { ...p, domain: p.domain ?? had?.domain ?? null });
    else if (!had.domain && p.domain) had.domain = p.domain;
  }
  for (const [k, p] of [...best.entries()].sort((a, b) => a[1].rank - b[1].rank)) {
    if (seen.has(k) || (p.cid && seen.has(p.cid)) || clean(p.title) === youName) continue;
    seen.add(k);
    out.push({ key: k, title: p.title, you: false, cid: p.cid, domain: ownSite(p.domain) });
    if (out.length > max) break;
  }
  return out;
}

const LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

/**
 * Who an answer names, in the order it names them. A link to the business's Maps listing (its cid) or its own website
 * counts first; otherwise its name, as whole words. Each business counts once, at its first mention.
 */
export function namedIn(text: string, sources: { url: string }[], cands: Candidate[]): Named[] {
  const at = new Map<string, { idx: number; how: Named["how"] }>();
  const mark = (c: Candidate, idx: number, how: Named["how"]) => {
    const had = at.get(c.key);
    if (!had || idx < had.idx) at.set(c.key, { idx, how: had?.how === "link" ? "link" : how });
  };
  const byCid = new Map(cands.filter((c) => c.cid).map((c) => [c.cid!, c]));
  const bySite = new Map<string, Candidate[]>();
  for (const c of cands) if (c.domain) bySite.set(c.domain, [...(bySite.get(c.domain) ?? []), c]);
  const linkHit = (url: string, idx: number) => {
    const cid = url.match(/[?&](?:cid|ludocid)=(\d+)/)?.[1];
    if (cid && byCid.has(cid)) return mark(byCid.get(cid)!, idx, "link");
    const host = bareHost(url);
    const owners = host ? (bySite.get(host) ?? []) : [];
    if (owners.length === 1) mark(owners[0], idx, "link"); // a site two businesses share proves neither
  };
  for (const m of text.matchAll(LINK)) linkHit(m[2], m.index ?? 0);
  for (const s of sources) linkHit(s.url, text.length + 1); // cited, but not placed in the text
  // Names, on the text without its links' addresses.
  const plain = text.replace(LINK, (_m, label: string) => ` ${label} `);
  const words = ` ${clean(plain)} `;
  for (const c of cands) {
    let first = -1;
    for (const n of nameForms(c.title)) {
      const i = words.indexOf(` ${n} `);
      if (i >= 0 && (first < 0 || i < first)) first = i;
    }
    if (first < 0) continue;
    // Name positions are in the cleaned text; scale them to the original so they sort with links.
    mark(c, Math.round((first / Math.max(1, words.length)) * text.length), "name");
  }
  return [...at.entries()]
    .sort((a, b) => a[1].idx - b[1].idx)
    .map(([key, v], n) => {
      const c = cands.find((x) => x.key === key)!;
      return { key, title: c.title, you: c.you, pos: n + 1, how: v.how };
    });
}

/** The sites an answer cites, as bare hosts, once each. */
export function citedSites(sources: { url: string; domain?: string }[]): string[] {
  return [...new Set(sources.map((s) => bareHost(s.domain || s.url)).filter((h) => h && !/(^|\.)google\.[a-z.]+$/.test(h)))].slice(0, 40);
}

/** One saved answer from DataForSEO's reply. */
export function readOf(answer: { text: string; sources: { url: string; domain?: string }[]; shown?: boolean }, cands: Candidate[]): AiRead {
  const shown = answer.shown !== false && Boolean(answer.text.trim());
  return { named: shown ? namedIn(answer.text, answer.sources, cands) : [], sources: shown ? citedSites(answer.sources) : [], shown, text: shown ? answer.text.slice(0, 1200) : "" };
}

/**
 * Sum up an AI grid. Points that failed are left out of every number; a point where Google showed no AI answer counts
 * as answered, naming nobody. Shares are over all answered points together, never from one point.
 */
export function summarizeAi(keyword: string, g: { center: { lat: number; lng: number }; size: number; shape: Shape; spacing: number; points: { i: number }[] }, reads: AiReads, cands: Candidate[]): AiResult {
  const pts = g.points.map((p) => ({ i: p.i, r: reads[String(p.i)] }));
  const ok = pts.filter((p) => p.r) as { i: number; r: AiRead }[];
  const pos: AiResult["pos"] = Array.from({ length: g.size * g.size }, () => undefined);
  for (const p of ok) pos[p.i] = p.r.named.find((n) => n.you)?.pos ?? null;
  const city = (e: "ChatGPT" | "Gemini") => {
    const r = reads[e];
    if (!r) return null;
    const me = r.named.find((n) => n.you);
    return { named: Boolean(me), pos: me?.pos ?? null };
  };
  const stats = new Map<string, { title: string; you: boolean; at: number[]; byName: boolean }>();
  for (const p of ok)
    for (const n of p.r.named) {
      const s = stats.get(n.key) ?? { title: n.title, you: n.you, at: [], byName: true };
      s.at.push(n.pos);
      if (n.how === "link") s.byName = false;
      stats.set(n.key, s);
    }
  const engine = (e: "ChatGPT" | "Gemini", key: string) => {
    const r = reads[e];
    return r ? (r.named.find((n) => n.key === key)?.pos ?? 0) : null; // 0: asked, not named
  };
  for (const e of ["ChatGPT", "Gemini"] as const)
    for (const n of reads[e]?.named ?? []) if (!stats.has(n.key)) stats.set(n.key, { title: n.title, you: n.you, at: [], byName: n.how === "name" });
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const businesses: AiBusiness[] = [...stats.entries()]
    .map(([key, s]) => ({ key, title: s.title, you: s.you, points: s.at.length, share: ok.length ? s.at.length / ok.length : 0, avgPos: avg(s.at), byName: s.byName, chatgpt: engine("ChatGPT", key), gemini: engine("Gemini", key) }))
    .sort((a, b) => b.share - a.share || (a.avgPos ?? 99) - (b.avgPos ?? 99) || Number(b.you) - Number(a.you));
  if (!businesses.some((b) => b.you)) {
    const me = cands.find((c) => c.you);
    if (me) businesses.push({ key: me.key, title: me.title, you: true, points: 0, share: 0, avgPos: null, byName: false, chatgpt: engine("ChatGPT", me.key), gemini: engine("Gemini", me.key) });
  }
  const yourSite = cands.find((c) => c.you)?.domain ?? null;
  const rivalSites = new Set(cands.filter((c) => !c.you && c.domain).map((c) => c.domain!));
  const count = new Map<string, number>();
  for (const r of [...ok.map((p) => p.r), reads.ChatGPT, reads.Gemini]) for (const d of r?.sources ?? []) count.set(d, (count.get(d) ?? 0) + 1);
  const me = businesses.find((b) => b.you)!;
  return {
    keyword,
    size: g.size,
    spacing: g.spacing,
    shape: g.shape,
    center: g.center,
    read: ok.length,
    pos,
    share: ok.length ? me.points / ok.length : null,
    avgPos: me.avgPos,
    chatgpt: city("ChatGPT"),
    gemini: city("Gemini"),
    businesses: businesses.slice(0, 15),
    sources: [...count.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)
      .map(([domain, n]) => ({ domain, n, whose: domain === yourSite ? "you" : rivalSites.has(domain) ? "rival" : null })),
  };
}

/**
 * AI Mode next to Google Maps, point by point (each AI point against the nearest Maps point): where you're in the Maps
 * top 3 but AI Mode doesn't name you, and the other way round.
 */
export function aiVsMaps(ai: { pos: (number | null | undefined)[]; points: { i: number; lat: number; lng: number }[] }, maps: { ranks: (number | null | undefined)[]; points: { i: number; lat: number; lng: number }[] }) {
  let mapsOnly = 0;
  let aiOnly = 0;
  let both = 0;
  for (const p of ai.points) {
    const a = ai.pos[p.i];
    if (a === undefined) continue;
    let near: { i: number; d: number } | null = null;
    for (const q of maps.points) {
      const d = (q.lat - p.lat) ** 2 + (q.lng - p.lng) ** 2;
      if (!near || d < near.d) near = { i: q.i, d };
    }
    const m = near ? maps.ranks[near.i] : undefined;
    if (m === undefined) continue;
    const top3 = m !== null && m <= 3;
    if (top3 && a === null) mapsOnly++;
    else if (!top3 && a !== null) aiOnly++;
    else if (top3 && a !== null) both++;
  }
  return { mapsOnly, aiOnly, both };
}
