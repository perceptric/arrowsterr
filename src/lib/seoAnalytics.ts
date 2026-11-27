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

export type OppKind = "low_ctr" | "page2" | "losing" | "new_topic" | "cannibal" | "links";
export const OPP_LABEL: Record<OppKind, string> = { low_ctr: "Low CTR", page2: "Page 2", losing: "Losing clicks", new_topic: "New topic", cannibal: "Two pages compete", links: "Needs links" };

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

  // Pages at positions 5 to 15 that links from the site's busiest related pages can push up.
  for (const s of linkSuggestions(input)) {
    const gain = Math.max(0, expectedCtr(Math.max(3, s.position - 3)) * s.impressions - s.clicks) * month * 0.5;
    if (gain < 15) continue;
    out.push({
      id: `links:${s.page}`,
      kind: "links",
      title: s.page,
      page: s.page,
      query: s.anchor,
      gain_clicks: Math.round(gain),
      gain_signups: signups(gain, s.page),
      why: `Position ${s.position.toFixed(1)} with ${fmt(s.impressions)} impressions, close to the top. ${s.sources.map((x) => x.page).join(" and ")} ${s.sources.length === 1 ? "gets" : "get"} far more visits and ${s.sources.length === 1 ? "covers" : "cover"} the same topic. Links from ${s.sources.length === 1 ? "it" : "them"} with the words “${s.anchor}” tell Google this page is the answer.`,
      data: { position: round1(s.position), impressions: s.impressions, clicks: s.clicks, anchor: s.anchor, sources: s.sources.map((x) => x.page) },
    });
  }

  const score = (o: Opportunity) => o.gain_clicks + (o.gain_signups ?? 0) * 25;
  return out.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

// ─────────────── Internal links to pages that need a push ───────────────

export type LinkSuggestion = { page: string; position: number; impressions: number; clicks: number; anchor: string; sources: { page: string; traffic: number; overlap: number }[] };

/** Folder names in addresses that say nothing about the topic ("/blog/x"). */
const PATH_STOP = new Set("blog blogs post posts news article articles resources resource guides guide learn page pages www html".split(" "));

/** The words a page is about: its address and its top searches. */
function topicOf(page: string, queries: QueryPageAgg[]): Set<string> {
  const words = new Set(wordsOf(page.replace(/[/_.-]+/g, " ")).filter((w) => !PATH_STOP.has(w)));
  for (const q of queries.slice(0, 10)) for (const w of wordsOf(q.query)) words.add(w);
  return words;
}

/**
 * Pages at average position 5 to 15 with real impressions, each with up to three of the site's busiest pages
 * (sessions plus Google clicks) that share its topic: the pages to link from, with the target's top search as the
 * link's words. The home page is left out on both sides: it links everywhere already.
 */
export function linkSuggestions(input: Pick<OppInput, "pages" | "queryPages">, opts: { minImpressions?: number; perTarget?: number } = {}): LinkSuggestion[] {
  const minImpressions = opts.minImpressions ?? 100;
  const per = opts.perTarget ?? 3;
  const queriesOf = new Map<string, QueryPageAgg[]>();
  for (const r of input.queryPages) queriesOf.set(r.page, [...(queriesOf.get(r.page) ?? []), r]);
  for (const list of queriesOf.values()) list.sort((a, b) => b.impressions - a.impressions);
  const pages = input.pages.filter((p) => p.page !== "/");
  const topics = new Map(pages.map((p) => [p.page, topicOf(p.page, queriesOf.get(p.page) ?? [])]));
  const traffic = (p: PageAgg) => p.sessions + p.clicks;
  const out: LinkSuggestion[] = [];
  for (const t of pages) {
    if (!t.position || t.position < 5 || t.position > 15 || t.impressions < minImpressions) continue;
    const want = topics.get(t.page)!;
    if (!want.size) continue;
    const sources = pages
      .filter((s) => s.page !== t.page && traffic(s) > traffic(t))
      .map((s) => {
        const have = topics.get(s.page)!;
        const shared = [...want].filter((w) => have.has(w)).length;
        return { page: s.page, traffic: traffic(s), overlap: shared / want.size, shared };
      })
      .filter((s) => s.shared >= 1 && s.overlap >= 0.25)
      .sort((a, b) => b.overlap * Math.log10(1 + b.traffic) - a.overlap * Math.log10(1 + a.traffic))
      .slice(0, per)
      .map(({ page, traffic: tr, overlap }) => ({ page, traffic: tr, overlap: round3(overlap) }));
    if (!sources.length) continue;
    const anchor = queriesOf.get(t.page)?.[0]?.query ?? t.page.split("/").filter(Boolean).pop()!.replace(/[-_]+/g, " ");
    out.push({ page: t.page, position: t.position, impressions: t.impressions, clicks: t.clicks, anchor, sources });
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

// ─────────────── Before and after: an article's results ───────────────

export type Totals = { clicks: number; impressions: number; position: number | null; sessions: number; conversions: number; ai_sessions: number };
export const NO_TOTALS: Totals = { clicks: 0, impressions: 0, position: null, sessions: 0, conversions: 0, ai_sessions: 0 };

/**
 * The days to compare for a page that went live (or was refreshed) at `at`: the `days` before it, and from that day
 * up to `days` after, cut at the last day with data. Null when there is no data since then yet.
 */
export function resultWindows(at: string, lastDay: string, days = 28): { before: [string, string]; after: [string, string]; afterDays: number; full: boolean } | null {
  const day = at.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > lastDay) return null;
  const end = addDays(day, days - 1) < lastDay ? addDays(day, days - 1) : lastDay;
  const afterDays = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 864e5) + 1;
  return { before: [addDays(day, -days), addDays(day, -1)], after: [day, end], afterDays, full: afterDays >= days };
}

export type ResultMetric = { before: number | null; after: number | null; change: number | null };
export type Result = Record<"clicks" | "impressions" | "position" | "sessions" | "conversions" | "ai_sessions", ResultMetric>;

/**
 * After against before, over the same number of days: the period before is scaled to the days since the change, so
 * a page live for 9 days is compared with 9 days' worth of the 28 before. `change` is a share (0.4 = up 40%) for
 * counts and places moved for position (negative is better). Null when there is nothing to compare with.
 */
export function compareResult(before: Totals, after: Totals, beforeDays: number, afterDays: number): Result {
  const scale = beforeDays ? afterDays / beforeDays : 0;
  const count = (b: number, a: number): ResultMetric => {
    const was = Math.round(b * scale);
    return { before: was, after: a, change: was ? Math.round(((a - was) / was) * 1000) / 1000 : null };
  };
  return {
    clicks: count(before.clicks, after.clicks),
    impressions: count(before.impressions, after.impressions),
    sessions: count(before.sessions, after.sessions),
    conversions: count(before.conversions, after.conversions),
    ai_sessions: count(before.ai_sessions, after.ai_sessions),
    position: {
      before: before.position === null ? null : round1(before.position),
      after: after.position === null ? null : round1(after.position),
      change: before.position !== null && after.position !== null ? round1(after.position - before.position) : null,
    },
  };
}

// ─────────────── Refresh: keep what ranks, rewrite what slipped ───────────────

export type PageSection = { heading: string; text: string };
export type SectionPlan = { heading: string; action: "keep" | "rewrite"; queries: string[]; why: string };
export type RefreshPlan = { sections: SectionPlan[]; add: QueryAgg[]; titleFix: { query: string; ctr: number; expected: number; position: number } | null };

/** How well a search fits a section: the share of the search's words found in it (heading words count most). */
function fit(query: string, s: PageSection): number {
  const words = wordsOf(query);
  if (!words.length) return 0;
  const head = new Set(wordsOf(s.heading));
  const body = new Set(wordsOf(s.text));
  return words.reduce((a, w) => a + (head.has(w) ? 1 : body.has(w) ? 0.6 : 0), 0) / words.length;
}

/**
 * What to do with each section of a page, from its Search Console queries now and in the period before:
 * - keep: a search it answers still ranks well (top 5, normal click rate);
 * - rewrite: the searches it answers slipped (down 1.5 places or more) or sit past page 1, and none ranks well;
 * - add: searches with real impressions that no section answers, as new sections (up to four);
 * - titleFix: the page's biggest page-1 search with a weak click rate, for a new title and meta description.
 */
export function planSections(sections: PageSection[], now: QueryAgg[], before: QueryAgg[] = []): RefreshPlan {
  const was = new Map(before.map((q) => [q.query, q]));
  type Kind = "good" | "slipped" | "weak" | "low_ctr" | "other";
  const kindOf = (q: QueryAgg): Kind => {
    const ctr = q.impressions ? q.clicks / q.impressions : 0;
    const prev = was.get(q.query);
    if (prev && prev.position && q.position - prev.position >= 1.5) return "slipped";
    if (q.position <= 5 && ctr >= expectedCtr(q.position) * 0.75) return "good";
    if (q.position <= 10.5 && q.impressions >= 100 && ctr < expectedCtr(q.position) * 0.75) return "low_ctr";
    if (q.position > 10.5) return "weak";
    return "other";
  };
  const by = sections.map(() => ({ good: [] as string[], bad: [] as string[] }));
  const unplaced: QueryAgg[] = [];
  for (const q of now) {
    const k = kindOf(q);
    let best = -1;
    let score = 0.5;
    sections.forEach((s, i) => {
      const f = fit(q.query, s);
      if (f >= score) [best, score] = [i, f];
    });
    if (best < 0) {
      if ((k === "weak" || k === "slipped") && q.impressions >= 30) unplaced.push(q);
      continue;
    }
    if (k === "good") by[best].good.push(q.query);
    else if (k === "slipped" || k === "weak") by[best].bad.push(q.query);
  }
  const plans: SectionPlan[] = sections.map((s, i) => {
    const { good, bad } = by[i];
    if (good.length) return { heading: s.heading, action: "keep", queries: good.slice(0, 5), why: `Still ranks well for ${good.slice(0, 2).map((q) => `“${q}”`).join(" and ")}.` };
    if (bad.length) return { heading: s.heading, action: "rewrite", queries: bad.slice(0, 5), why: `${bad.slice(0, 2).map((q) => `“${q}”`).join(" and ")} slipped or sit past page 1.` };
    return { heading: s.heading, action: "keep", queries: [], why: "No search lands here, so it stays as it is." };
  });
  const seen = new Set<string>();
  const add = unplaced
    .sort((a, b) => b.impressions - a.impressions)
    .filter((q) => {
      const key = wordsOf(q.query).slice(0, 2).sort().join(" ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
  const weakCtr = now.filter((q) => kindOf(q) === "low_ctr").sort((a, b) => b.impressions - a.impressions)[0];
  const titleFix = weakCtr ? { query: weakCtr.query, ctr: round3(weakCtr.clicks / weakCtr.impressions), expected: round3(expectedCtr(weakCtr.position)), position: round1(weakCtr.position) } : null;
  return { sections: plans, add, titleFix };
}

// ─────────────── The AI answers that cite the brand's own pages ───────────────

export type OwnCitation = { page: string; engines: string[]; prompts: number; answers: number };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** The brand's own pages the tracked AI answers cite, with the AIs that cite each and how many prompts and answers. */
export function ownCitations(chats: { engine: string; prompt: string; sources?: { url: string }[] | null }[], domain: string): OwnCitation[] {
  const own = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const by = new Map<string, { engines: Set<string>; prompts: Set<string>; answers: number }>();
  for (const c of chats) {
    const pages = new Set<string>();
    for (const s of c.sources ?? []) {
      const host = hostOf(s.url);
      if (!host || (host !== own && !host.endsWith(`.${own}`))) continue;
      pages.add(pagePath(s.url));
    }
    for (const page of pages) {
      const x = by.get(page) ?? { engines: new Set<string>(), prompts: new Set<string>(), answers: 0 };
      x.engines.add(c.engine);
      x.prompts.add(c.prompt);
      x.answers += 1;
      by.set(page, x);
    }
  }
  return [...by.entries()].map(([page, x]) => ({ page, engines: [...x.engines].sort(), prompts: x.prompts.size, answers: x.answers })).sort((a, b) => b.answers - a.answers);
}

const DAY = 864e5;
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

// ─────────────── The dashboard: series, movers, channels and rank weeks ───────────────

export type DayPoint = { clicks: number; impressions: number; ctr: number | null; position: number | null; sessions: number | null; conversions: number | null };
export type DayRow = { day: string; clicks?: number; impressions?: number; position?: number | null; sessions?: number; conversions?: number };

/**
 * One period's days, day by day from `from`, with every metric. Missing Search Console days are 0 clicks; GA4
 * metrics stay null when `ga4` is false (no property picked), so the page shows "–" instead of zeros.
 */
export function daySeries(rows: DayRow[], from: string, days: number, ga4: boolean): DayPoint[] {
  const by = new Map(rows.map((r) => [r.day, r]));
  const out: DayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const r = by.get(addDays(from, i));
    const clicks = r?.clicks ?? 0;
    const impressions = r?.impressions ?? 0;
    out.push({
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : null,
      position: impressions && r?.position ? r.position : null,
      sessions: ga4 ? (r?.sessions ?? 0) : null,
      conversions: ga4 ? (r?.conversions ?? 0) : null,
    });
  }
  return out;
}

export type PeriodTotals = { clicks: number; impressions: number; ctr: number | null; position: number | null; sessions: number | null; conversions: number | null };

/** A period's totals: counts add up, CTR is clicks over impressions, position is weighted by impressions. */
export function periodTotals(points: DayPoint[]): PeriodTotals {
  const clicks = points.reduce((a, p) => a + p.clicks, 0);
  const impressions = points.reduce((a, p) => a + p.impressions, 0);
  const placed = points.filter((p) => p.position !== null && p.impressions);
  const weight = placed.reduce((a, p) => a + p.impressions, 0);
  const ga4 = points.some((p) => p.sessions !== null);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : null,
    position: weight ? round1(placed.reduce((a, p) => a + p.position! * p.impressions, 0) / weight) : null,
    sessions: ga4 ? points.reduce((a, p) => a + (p.sessions ?? 0), 0) : null,
    conversions: ga4 ? points.reduce((a, p) => a + (p.conversions ?? 0), 0) : null,
  };
}

export type Mover = { key: string; clicks: number; before: number; change: number };

/** The biggest gains and losses in clicks between two periods, `n` each. Keys missing from one side count as 0. */
export function movers(now: { key: string; clicks: number }[], before: { key: string; clicks: number }[], n = 5): { up: Mover[]; down: Mover[] } {
  const was = new Map(before.map((r) => [r.key, r.clicks]));
  const is = new Map(now.map((r) => [r.key, r.clicks]));
  const all = [...new Set([...is.keys(), ...was.keys()])].map((key) => {
    const clicks = is.get(key) ?? 0;
    const b = was.get(key) ?? 0;
    return { key, clicks, before: b, change: clicks - b };
  });
  return {
    up: all.filter((m) => m.change > 0).sort((a, b) => b.change - a.change || b.clicks - a.clicks).slice(0, n),
    down: all.filter((m) => m.change < 0).sort((a, b) => a.change - b.change || b.before - a.before).slice(0, n),
  };
}

/** Daily clicks over [from, from + days) folded into `points` equal buckets, oldest first, for a small trend line. */
export function trendPoints(rows: { day: string; clicks: number }[], from: string, days: number, points = 12): number[] {
  const out = new Array(points).fill(0);
  const start = Date.parse(`${from}T00:00:00Z`);
  for (const r of rows) {
    const i = Math.floor((Date.parse(`${r.day}T00:00:00Z`) - start) / DAY);
    if (i < 0 || i >= days) continue;
    out[Math.min(points - 1, Math.floor((i * points) / days))] += r.clicks;
  }
  return out;
}

export type Channel = "Organic search" | "Direct" | "AI assistants" | "Referral" | "Social" | "Email" | "Paid search" | "Other";
const CHANNEL_OF: Record<string, Channel> = {
  "organic search": "Organic search",
  direct: "Direct",
  referral: "Referral",
  "organic social": "Social",
  "paid social": "Social",
  email: "Email",
  "paid search": "Paid search",
  "cross-network": "Paid search",
  "paid shopping": "Paid search",
  "organic shopping": "Organic search",
  "organic video": "Social",
};

/** GA4's default channel group in plain words. Anything unusual is "Other". */
export const channelName = (group: string): Channel => CHANNEL_OF[group.trim().toLowerCase()] ?? "Other";

/**
 * Sessions by channel, biggest first. Visits from AI assistants arrive in GA4 as Referral, so `ai` sessions move out
 * of Referral into their own "AI assistants" channel. Channels with no sessions are left out.
 */
export function channelMix(rows: { channel: string; sessions: number }[], ai: number): { channel: Channel; sessions: number }[] {
  const by = new Map<Channel, number>();
  for (const r of rows) by.set(channelName(r.channel), (by.get(channelName(r.channel)) ?? 0) + r.sessions);
  const moved = Math.min(ai, by.get("Referral") ?? 0);
  if (moved) {
    by.set("Referral", (by.get("Referral") ?? 0) - moved);
    by.set("AI assistants", moved);
  }
  return [...by.entries()].filter(([, s]) => s > 0).map(([channel, sessions]) => ({ channel, sessions })).sort((a, b) => b.sessions - a.sessions);
}

export type RankBucket = "top3" | "top10" | "top20";
/** The bucket for an average position: 1–3, 4–10, 11–20, or null past 20. Matches analytics_rank_weeks in SQL. */
export const rankBucket = (position: number): RankBucket | null => (position < 3.5 ? "top3" : position < 10.5 ? "top10" : position < 20.5 ? "top20" : null);

/** Week-by-week counts from analytics_rank_weeks (week_back 0 = the latest), oldest week first, with empty weeks as 0. */
export function rankWeeks(rows: { week_back: number; bucket: string; queries: number }[], weeks = 12): Record<RankBucket, number>[] {
  const out = Array.from({ length: weeks }, () => ({ top3: 0, top10: 0, top20: 0 }));
  for (const r of rows) {
    const i = weeks - 1 - Number(r.week_back);
    if (i < 0 || i >= weeks || !(r.bucket in out[0])) continue;
    out[i][r.bucket as RankBucket] += Number(r.queries) || 0;
  }
  return out;
}

// ─────────────── Dates ───────────────

const iso =(t: number) => new Date(t).toISOString().slice(0, 10);
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
