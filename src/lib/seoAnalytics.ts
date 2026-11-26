// SEO analytics: Search Console and Google Analytics 4 joined by page (seoAnalyticsServer.ts syncs them once a day).
// This file holds the plain parts: page paths, the click rate a position usually gets, the "Chance" tag on a query,
// and the Opportunities. No server imports, so the browser and the tests use it too.

import { aiSourceOf } from "./aiSources.ts";
import type { GscRow } from "./searchEngines.ts";

export type QueryAgg = { query: string; clicks: number; impressions: number; position: number };
export type PageAgg = { page: string; clicks: number; impressions: number; position: number | null; sessions: number; conversions: number; ai_sessions: number };
export type QueryPageAgg = { query: string; page: string; clicks: number; impressions: number; position: number };

/** "https://www.Example.com/Blog/Post/?utm=1#top" → "/blog/post". GA4 paths ("/blog/post?x") come out the same. */
export function pagePath(url: string): string {
  let s = String(url ?? "").trim();
  if (!s || s === "(not set)") return "/";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, "");
  s = s.split(/[?#]/)[0] || "/";
  try {
    s = decodeURI(s);
  } catch {
    // Leave odd escapes as they are.
  }
  s = s.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/index\.html?$/, "/");
  if (!s.startsWith("/")) s = `/${s}`;
  return s.length > 1 ? s.replace(/\/+$/, "") : "/";
}

// The share of searchers who click a result at each position on page 1, then pages 2 and 3. Rounded from public
// click-rate studies of Google results; good enough to say "this page gets far fewer clicks than its spot should".
const CTR_AT = [0, 0.28, 0.155, 0.105, 0.075, 0.057, 0.045, 0.036, 0.03, 0.025, 0.021, 0.014, 0.012, 0.011, 0.01, 0.009, 0.008, 0.0075, 0.007, 0.0065, 0.006];

/** The usual click rate (0 to 1) for an average position, with in-between positions blended. */
export function expectedCtr(position: number | null | undefined): number {
  if (!position || !Number.isFinite(position) || position < 1) return CTR_AT[1];
  if (position >= 20) return Math.max(0.002, CTR_AT[20] * (20 / position));
  const lo = Math.floor(position);
  const t = position - lo;
  return CTR_AT[lo] + (CTR_AT[lo + 1] - CTR_AT[lo]) * t;
}

export type Chance = "low_ctr" | "page2" | "winning";
export const CHANCE_LABEL: Record<Chance, string> = { low_ctr: "Low CTR", page2: "Page 2", winning: "Winning" };

/** The tag on a query row: page 1 with far fewer clicks than its spot gets, page 2, or doing well near the top. */
export function chanceOf(q: { clicks: number; impressions: number; position: number }, minImpressions = 100): Chance | null {
  if (q.impressions < minImpressions || !q.position) return null;
  const ctr = q.clicks / q.impressions;
  if (q.position <= 10.5 && ctr < expectedCtr(q.position) * 0.75) return "low_ctr";
  if (q.position > 10.5 && q.position <= 20.5) return "page2";
  if (q.position <= 3.5 && ctr >= expectedCtr(q.position) * 0.8) return "winning";
  return null;
}

export type OppKind = "low_ctr" | "page2" | "losing" | "new_topic" | "cannibal";
export const OPP_LABEL: Record<OppKind, string> = { low_ctr: "Low CTR", page2: "Page 2", losing: "Losing clicks", new_topic: "New topic", cannibal: "Two pages compete" };

export type Opportunity = {
  id: string;
  kind: OppKind;
  title: string; // the query, or the page for "losing"
  page: string | null;
  query: string | null;
  gain_clicks: number; // extra clicks a month if fixed (for "losing": clicks a month lost)
  gain_signups: number | null; // from the page's own GA4 conversion rate, when known
  why: string;
  data: Record<string, number | string | string[] | null>;
};

export type OppInput = {
  days: number; // the length of each period, usually 28
  queries: QueryAgg[]; // this period
  pages: PageAgg[]; // this period
  pagesPrev: PageAgg[]; // the period before
  queryPages: QueryPageAgg[]; // this period, by query and page
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pctOf = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
const STOP = new Set("a an and are best by can do does for from get how i in is it my of on or the to vs what when where which who why with your you".split(" "));
const wordsOf = (q: string) => q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Each query's best page: the one with the most impressions for it. */
function bestPages(queryPages: QueryPageAgg[]) {
  const by = new Map<string, QueryPageAgg[]>();
  for (const r of queryPages) by.set(r.query, [...(by.get(r.query) ?? []), r]);
  for (const list of by.values()) list.sort((a, b) => b.impressions - a.impressions);
  return by;
}

/**
 * The day's Opportunities, most worth doing first: queries on page 1 with a weak click rate, queries on page 2,
 * pages losing clicks, groups of queries with no page for them, and queries split between two pages.
 * Gains are a month's extra clicks; sign-ups use the page's GA4 conversion rate when it has sessions.
 */
export function findOpportunities(input: OppInput, limit = 12): Opportunity[] {
  const month = 30 / Math.max(1, input.days);
  const pageBy = new Map(input.pages.map((p) => [p.page, p]));
  const rateOf = (page: string | null) => {
    const p = page ? pageBy.get(page) : null;
    return p && p.sessions >= 50 ? p.conversions / p.sessions : null;
  };
  const signups = (clicks: number, page: string | null) => {
    const r = rateOf(page);
    return r === null ? null : Math.round(clicks * r * 10) / 10;
  };
  const byQuery = bestPages(input.queryPages);
  const out: Opportunity[] = [];
  const taken = new Set<string>();

  for (const q of input.queries) {
    const ctr = q.impressions ? q.clicks / q.impressions : 0;
    const page = byQuery.get(q.query)?.[0]?.page ?? null;
    const chance = chanceOf(q);
    if (chance === "low_ctr") {
      const target = expectedCtr(q.position);
      const gain = (target - ctr) * q.impressions * month;
      if (gain < 15) continue;
      out.push({
        id: `low_ctr:${q.query}`,
        kind: "low_ctr",
        title: q.query,
        page,
        query: q.query,
        gain_clicks: Math.round(gain),
        gain_signups: signups(gain, page),
        why: `Position ${q.position.toFixed(1)} but only ${pctOf(ctr)} of searchers click. Results at this spot usually get about ${pctOf(target)}. A clearer title and meta description that say what's on the page should close the gap.`,
        data: { position: round1(q.position), ctr: round3(ctr), expected: round3(target), impressions: q.impressions, clicks: q.clicks },
      });
      taken.add(q.query);
    } else if (chance === "page2") {
      const target = expectedCtr(7);
      const gain = (target * q.impressions - q.clicks) * month;
      if (gain < 15) continue;
      const s = signups(gain, page);
      out.push({
        id: `page2:${q.query}`,
        kind: "page2",
        title: q.query,
        page,
        query: q.query,
        gain_clicks: Math.round(gain),
        gain_signups: s,
        why: `${fmt(q.impressions)} impressions at position ${q.position.toFixed(1)}, just off page 1.${s ? ` The page converts at ${pctOf(rateOf(page)!)} in GA4, so page 1 is worth about ${s} sign-ups a month.` : ""} A refresh that answers the search better and a few internal links can move it up.`,
        data: { position: round1(q.position), impressions: q.impressions, clicks: q.clicks },
      });
      taken.add(q.query);
    }
  }

  // Pages losing clicks: down at least a quarter, with the average position slipping.
  const prevBy = new Map(input.pagesPrev.map((p) => [p.page, p]));
  for (const page of new Set(input.pagesPrev.map((p) => p.page))) {
    const before = prevBy.get(page)!;
    const now = pageBy.get(page) ?? { page, clicks: 0, impressions: 0, position: null, sessions: 0, conversions: 0, ai_sessions: 0 };
    if (before.clicks < 30) continue;
    const drop = (before.clicks - now.clicks) / before.clicks;
    const slip = now.position && before.position ? now.position - before.position : 0;
    if (drop < 0.25 || (slip < 0.8 && now.clicks > 0)) continue;
    const lost = (before.clicks - now.clicks) * month;
    out.push({
      id: `losing:${page}`,
      kind: "losing",
      title: page,
      page,
      query: null,
      gain_clicks: Math.round(lost),
      gain_signups: signups(lost, page),
      why: `Clicks fell from ${fmt(before.clicks)} to ${fmt(now.clicks)} (−${Math.round(drop * 100)}%)${before.position && now.position ? ` and the average position slipped from ${before.position.toFixed(1)} to ${now.position.toFixed(1)}` : ""}. Newer pages likely answer the search better. Refresh it before it drops further.`,
      data: { clicks: now.clicks, clicks_before: before.clicks, position: now.position ? round1(now.position) : null, position_before: before.position ? round1(before.position) : null },
    });
  }

  // Two pages competing for one query: each takes at least a fifth of its impressions.
  for (const [query, list] of byQuery) {
    const total = list.reduce((a, r) => a + r.impressions, 0);
    if (total < 150 || list.length < 2 || taken.has(query)) continue;
    const big = list.filter((r) => r.impressions / total >= 0.2);
    if (big.length < 2) continue;
    const best = Math.min(...big.map((r) => r.position));
    const clicks = list.reduce((a, r) => a + r.clicks, 0);
    const gain = Math.max(0, expectedCtr(Math.max(1, best - 2)) * total - clicks) * month * 0.5;
    if (gain < 15) continue;
    out.push({
      id: `cannibal:${query}`,
      kind: "cannibal",
      title: query,
      page: big[0].page,
      query,
      gain_clicks: Math.round(gain),
      gain_signups: signups(gain, big[0].page),
      why: `${big.length} of your pages split the impressions for this search (${big.map((r) => r.page).slice(0, 3).join(", ")}), so Google ranks neither well. Make one page the clear answer and link the other to it.`,
      data: { pages: big.map((r) => r.page).slice(0, 5), impressions: total },
    });
    taken.add(query);
  }

  // New topics: three or more searches that share words, all past position 20, with no page clearly for them.
  const loose = input.queries.filter((q) => q.position > 20 && q.impressions >= 20 && !taken.has(q.query));
  const groups = new Map<string, QueryAgg[]>();
  for (const q of loose) {
    const w = wordsOf(q.query);
    if (w.length < 2) continue;
    for (let i = 0; i < w.length - 1; i++) {
      const key = [w[i], w[i + 1]].sort().join(" ");
      groups.set(key, [...(groups.get(key) ?? []), q]);
    }
  }
  const usedQ = new Set<string>();
  for (const [, list] of [...groups.entries()].sort((a, b) => sum(b[1]) - sum(a[1]))) {
    const fresh = list.filter((q) => !usedQ.has(q.query));
    if (fresh.length < 3) continue;
    for (const q of fresh) usedQ.add(q.query);
    const top = [...fresh].sort((a, b) => b.impressions - a.impressions)[0];
    const impressions = sum(fresh);
    const gain = expectedCtr(6) * impressions * month;
    if (gain < 15) continue;
    out.push({
      id: `new_topic:${top.query}`,
      kind: "new_topic",
      title: top.query,
      page: null,
      query: top.query,
      gain_clicks: Math.round(gain),
      gain_signups: null,
      why: `You get impressions for ${fresh.length} searches like this (${fmt(impressions)} in total) but rank past position 20 for all of them, so no page is really about it yet. A page for it can win these clicks.`,
      data: { queries: fresh.map((q) => q.query).slice(0, 12), impressions },
    });
  }

  const score = (o: Opportunity) => o.gain_clicks + (o.gain_signups ?? 0) * 25;
  return out.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

const sum = (list: { impressions: number }[]) => list.reduce((a, q) => a + q.impressions, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// ─────────────── Rows from Google, ready to save ───────────────

export type GscDbRow = { day: string; page: string; query: string; clicks: number; impressions: number; position: number };

/** Search Console rows with keys [date, page, query] → saved rows. Pages that normalise to the same path add up. */
export function gscDbRows(rows: GscRow[]): GscDbRow[] {
  const by = new Map<string, GscDbRow>();
  for (const r of rows) {
    const [day, page, query] = r.keys;
    if (!day || !query) continue;
    const row = { day: day.slice(0, 10), page: pagePath(page ?? "/"), query: query.toLowerCase().trim().slice(0, 300), clicks: r.clicks, impressions: r.impressions, position: r.position };
    const key = `${row.day}|${row.page}|${row.query}`;
    const had = by.get(key);
    if (!had) by.set(key, row);
    else {
      const imp = had.impressions + row.impressions;
      had.position = imp ? (had.position * had.impressions + row.position * row.impressions) / imp : had.position;
      had.clicks += row.clicks;
      had.impressions = imp;
    }
  }
  return [...by.values()].map((r) => ({ ...r, position: round1(r.position) }));
}

export type Ga4DbRow = { day: string; page: string; sessions: number; conversions: number; ai_sessions: number; ai: Record<string, number> };

/**
 * GA4 rows → saved rows by day and landing page. `pages`: [date, landingPage] with sessions and key events.
 * `ai`: [date, landingPage, sessionSource] with sessions, already limited to AI sites.
 */
export function ga4DbRows(pages: { date: string; page: string; sessions: number; conversions: number }[], ai: { date: string; page: string; source: string; sessions: number }[]): Ga4DbRow[] {
  const ymd = (s: string) => (s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s.slice(0, 10));
  const by = new Map<string, Ga4DbRow>();
  const row = (date: string, page: string) => {
    const day = ymd(date);
    const path = pagePath(page);
    const key = `${day}|${path}`;
    const r = by.get(key) ?? { day, page: path, sessions: 0, conversions: 0, ai_sessions: 0, ai: {} };
    by.set(key, r);
    return r;
  };
  for (const p of pages) {
    if (!p.date) continue;
    const r = row(p.date, p.page);
    r.sessions += p.sessions;
    r.conversions += Math.round(p.conversions);
  }
  for (const a of ai) {
    const engine = aiSourceOf(a.source);
    if (!engine || !a.date) continue;
    const r = row(a.date, a.page);
    r.ai_sessions += a.sessions;
    r.ai[engine] = (r.ai[engine] ?? 0) + a.sessions;
  }
  return [...by.values()];
}

// ─────────────── Dates ───────────────

const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => iso(Date.parse(`${day}T00:00:00Z`) + n * DAY);

/** Search Console keeps 16 months. */
export const GSC_HISTORY_DAYS = 480;
/** Search Console runs about three days behind. */
export const GSC_LAG = 3;

/**
 * The next Search Console windows to fetch: first the newest days not saved yet, then (until history is complete)
 * one older chunk going back toward 16 months. Each window is at most `chunk` days.
 */
export function gscWindows(state: { gsc_from: string | null; gsc_to: string | null; backfilled: boolean }, today: string, chunk = 30): { newest: [string, string] | null; older: [string, string] | null; done: boolean } {
  const end = addDays(today, -GSC_LAG);
  const oldest = addDays(end, -GSC_HISTORY_DAYS);
  if (!state.gsc_to || !state.gsc_from) {
    return { newest: [addDays(end, -(chunk - 1)), end], older: null, done: false };
  }
  let newest: [string, string] | null = null;
  if (state.gsc_to < end) {
    const start = addDays(state.gsc_to, 1);
    const stop = addDays(start, chunk - 1) < end ? addDays(start, chunk - 1) : end;
    newest = [start, stop];
  }
  let older: [string, string] | null = null;
  if (!state.backfilled && state.gsc_from > oldest) {
    const stop = addDays(state.gsc_from, -1);
    const start = addDays(stop, -(chunk - 1)) > oldest ? addDays(stop, -(chunk - 1)) : oldest;
    older = [start, stop];
  }
  return { newest, older, done: !newest && !older };
}
