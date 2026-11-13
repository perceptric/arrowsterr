// Visibility › Traffic: rank tracking projects. Where a domain or one URL ranks on Google for each keyword, every day.
// Pure, shared by the server, the screens and the tests.

import { bareHost, hostOf, sameSite } from "./rankChecks.ts";

export const DAILY_DEPTH = 30; // results read on most days
export const DEEP_DEPTH = 100; // results read once a week, so pages ranking 31 to 100 still show
export const MAX_KEYWORDS_PER_PROJECT = 500;
export const MAX_KEYWORD_LENGTH = 80;

export type Scope = "domain" | "url";
export type Device = "desktop" | "mobile";

/** A project's target from what someone typed: a domain (every page counts) or one page's address (only it counts). */
export function readTarget(input: string): { target: string; scope: Scope } | null {
  const raw = input.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = bareHost(u.hostname);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null;
  const path = u.pathname.replace(/\/+$/, "");
  return path ? { target: `${host}${path}`, scope: "url" } : { target: host, scope: "domain" };
}

/** An address cleaned for comparing pages: no scheme, www, query, # part or trailing slash. */
export function samePage(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `${bareHost(u.hostname)}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export type Organic = { rank: number; url: string };

/** The target's best spot in Google's regular results, or null when it isn't in them. */
export function findPosition(organic: Organic[], target: string, scope: Scope): { position: number; url: string } | null {
  const want = samePage(target);
  const domain = target.split("/")[0];
  const sorted = [...organic].sort((a, b) => a.rank - b.rank);
  for (const r of sorted) {
    const hit = scope === "url" ? samePage(r.url) === want : sameSite(hostOf(r.url.startsWith("http") ? r.url : `https://${r.url}`), domain);
    if (hit) return { position: r.rank, url: r.url };
  }
  return null;
}

/** The weekday a project reads 100 results on: spread over the week by project, so the deep checks don't all land on one day. */
export function deepWeekday(projectId: string): number {
  let h = 0;
  for (const ch of projectId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 7;
}
export function depthFor(projectId: string, day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay() === deepWeekday(projectId) ? DEEP_DEPTH : DAILY_DEPTH;
}

/** Click share by position (positions 1 to 10, then 11 to 20), for the visibility score. */
const CTR = [31.7, 24.7, 18.7, 13.6, 9.5, 6.2, 4.2, 3.1, 3.0, 2.2];
export function ctrOf(position: number | null): number {
  if (!position || position < 1) return 0;
  if (position <= 10) return CTR[position - 1];
  if (position <= 20) return 1;
  return 0;
}

export type Summary = { keywords: number; checked: number; avg: number | null; top3: number; top10: number; top30: number; ranked: number; visibility: number };

/**
 * A project's numbers for one day. avg is the average position of the keywords that rank; visibility is the share of
 * the clicks the project would get if every keyword ranked first, 0 to 100.
 */
export function summarize(positions: (number | null | undefined)[]): Summary {
  const checked = positions.filter((p) => p !== undefined);
  const ranked = checked.filter((p): p is number => typeof p === "number" && p > 0);
  const avg = ranked.length ? Math.round((ranked.reduce((n, p) => n + p, 0) / ranked.length) * 10) / 10 : null;
  const vis = positions.length ? (positions.reduce<number>((n, p) => n + ctrOf(p ?? null), 0) / (positions.length * CTR[0])) * 100 : 0;
  return {
    keywords: positions.length,
    checked: checked.length,
    avg,
    top3: ranked.filter((p) => p <= 3).length,
    top10: ranked.filter((p) => p <= 10).length,
    top30: ranked.filter((p) => p <= 30).length,
    ranked: ranked.length,
    visibility: Math.round(vis * 10) / 10,
  };
}

export type Move = { kind: "up" | "down" | "same" | "new" | "lost" | "none"; by: number };

/** How a keyword moved since an earlier check. Up means a better (smaller) position. */
export function moveOf(now: number | null | undefined, before: number | null | undefined): Move {
  const n = now ?? null;
  const b = before ?? null;
  if (n === null && b === null) return { kind: "none", by: 0 };
  if (b === null) return { kind: "new", by: 0 };
  if (n === null) return { kind: "lost", by: 0 };
  if (n === b) return { kind: "same", by: 0 };
  return n < b ? { kind: "up", by: b - n } : { kind: "down", by: n - b };
}

/** Keywords from pasted text: one per line or comma, lowercased, trimmed, without repeats or long lines. */
export function readKeywords(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of text.split(/[\n,;\t]+/)) {
    const k = part.trim().replace(/\s+/g, " ").toLowerCase();
    if (!k || k.length > MAX_KEYWORD_LENGTH || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** Google's result parts besides regular results, named for people: AI Overview, People also ask and the rest. */
const FEATURES: Record<string, string> = {
  ai_overview: "AI Overview",
  people_also_ask: "People also ask",
  featured_snippet: "Featured snippet",
  local_pack: "Local pack",
  images: "Images",
  video: "Videos",
  top_stories: "Top stories",
  shopping: "Shopping",
  popular_products: "Products",
  knowledge_graph: "Knowledge panel",
  discussions_and_forums: "Forums",
};
export function featuresOf(types: string[]): string[] {
  return [...new Set(types.map((t) => FEATURES[t]).filter(Boolean))];
}

/** The keyword's spot to show: a number, "30+" when it wasn't in the 30 read, "100+" after a deep read, or blank before a check. */
export function positionLabel(position: number | null | undefined, depth: number | null | undefined, checked: boolean): string {
  if (!checked) return "";
  if (position) return String(position);
  return `${depth ?? DAILY_DEPTH}+`;
}
