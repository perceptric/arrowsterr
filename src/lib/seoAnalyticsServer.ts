import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_SOURCES } from "./aiSources";
import {
  addDays,
  chanceOf,
  citedByAi,
  compareResult,
  findOpportunities,
  ga4DbRows,
  gscDbRows,
  gscWindows,
  GSC_LAG,
  NO_TOTALS,
  ownCitations,
  pagePath,
  resultWindows,
  type Chance,
  type CitedPage,
  type Opportunity,
  type PageAgg,
  type QueryAgg,
  type QueryPageAgg,
  type Result,
  type Totals,
} from "./seoAnalytics";
import { accessToken, GSC_SCOPE, gscQuery, listGscSites, runReports, type ReportRow } from "./google";
import { enqueue, enqueueMany, finish, retry, type Job } from "./jobs";
import { gscRows, gscSites, pickGscProperty, type GscSite } from "./searchEngines";

// Analytics on the server: Search Console and Google Analytics 4, synced once a day per brand into the analytics_*
// tables (supabase/104_analytics.sql). The first sync pulls the last 30 days, then walks back a month at a time to
// 16 months of Search Console history. After each sync the day's Opportunities are worked out (seoAnalytics.ts).
// Reading Google is free, so none of this uses tasks.

export type Conn = { refresh_token: string; email: string | null; scopes: string | null };
export type BrandRow = { id: string; workspace_id: string; name: string; domain: string; ga4_property: string | null; ga4_property_name: string | null; gsc_property: string | null };
export type SyncState = { gsc_from: string | null; gsc_to: string | null; ga4_to: string | null; backfilled: boolean; syncing: boolean; error: string | null; synced_at: string | null };

export const hasGscScope = (scopes: string | null | undefined) => Boolean(scopes && scopes.split(/\s+/).includes(GSC_SCOPE));
const today = () => new Date().toISOString().slice(0, 10);
const BATCH = 1000;
const GSC_PAGE = 25_000;
const GSC_MAX_ROWS = 100_000; // per window, most clicks first
const GA4_FIRST_DAYS = 90;

/** The brand with its Google sign-in, or null when it has none. */
export async function googleFor(db: SupabaseClient, brandId: string): Promise<{ brand: BrandRow; conn: Conn | null; state: SyncState | null } | null> {
  const { data: brand } = await db.from("brands").select("id, workspace_id, name, domain, ga4_property, ga4_property_name, gsc_property").eq("id", brandId).maybeSingle();
  if (!brand) return null;
  const [{ data: conn }, { data: state }] = await Promise.all([
    db.from("ga4_connections").select("refresh_token, email, scopes").eq("brand_id", brandId).maybeSingle(),
    db.from("analytics_state").select("gsc_from, gsc_to, ga4_to, backfilled, syncing, error, synced_at").eq("brand_id", brandId).maybeSingle(),
  ]);
  return { brand: brand as BrandRow, conn: (conn as Conn | null) ?? null, state: (state as SyncState | null) ?? null };
}

/** The Search Console properties this sign-in can read, and the one that fits the brand's domain. */
export async function gscSitesFor(conn: Conn, domain: string): Promise<{ sites: GscSite[]; suggested: string | null }> {
  const sites = gscSites(await listGscSites(await accessToken(conn.refresh_token)));
  return { sites, suggested: pickGscProperty(sites, domain) };
}

async function upsert(db: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + BATCH), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function saveState(db: SupabaseClient, brand: BrandRow, patch: Partial<SyncState>) {
  await db.from("analytics_state").upsert({ brand_id: brand.id, workspace_id: brand.workspace_id, ...patch }, { onConflict: "brand_id" });
}

/** One Search Console window: daily totals, then rows by day, page and query (most clicks first). */
async function syncGscWindow(db: SupabaseClient, token: string, brand: BrandRow, [start, end]: [string, string]) {
  const site = brand.gsc_property!;
  const daily = gscRows(await gscQuery(token, site, { startDate: start, endDate: end, dimensions: ["date"], rowLimit: 1000 }));
  await upsert(
    db,
    "analytics_gsc_days",
    daily.filter((r) => r.keys[0]).map((r) => ({ brand_id: brand.id, workspace_id: brand.workspace_id, day: r.keys[0].slice(0, 10), clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), position: Math.round(r.position * 10) / 10 })),
    "brand_id,day",
  );
  for (let startRow = 0; startRow < GSC_MAX_ROWS; startRow += GSC_PAGE) {
    const rows = gscRows(await gscQuery(token, site, { startDate: start, endDate: end, dimensions: ["date", "page", "query"], rowLimit: GSC_PAGE, startRow }));
    await upsert(db, "analytics_gsc", gscDbRows(rows).map((r) => ({ brand_id: brand.id, workspace_id: brand.workspace_id, ...r })), "brand_id,day,page,query");
    if (rows.length < GSC_PAGE) break;
  }
}

const AI_DOMAINS = [...new Set(Object.values(AI_SOURCES).flat().flatMap((d) => [d, d.replace(/^www\./, "")]))];
const val = (r: ReportRow, i: number) => r.dimensionValues?.[i]?.value ?? "";
const num = (r: ReportRow, i: number) => Number(r.metricValues?.[i]?.value ?? 0);

/** GA4 by day and landing page for [start, end]: sessions, key events and visits from AI. */
async function syncGa4(db: SupabaseClient, token: string, brand: BrandRow, start: string, end: string) {
  const range = [{ startDate: start, endDate: end }];
  const run = (conversion: string) =>
    runReports(token, brand.ga4_property!, [
      { dateRanges: range, dimensions: [{ name: "date" }, { name: "landingPage" }], metrics: [{ name: "sessions" }, { name: conversion }], limit: 100_000 },
      {
        dateRanges: range,
        dimensions: [{ name: "date" }, { name: "landingPage" }, { name: "sessionSource" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: { filter: { fieldName: "sessionSource", inListFilter: { values: AI_DOMAINS, caseSensitive: false } } },
        limit: 50_000,
      },
    ]);
  // Properties made before 2024 may still call key events "conversions".
  const [pages, ai] = await run("keyEvents").catch(() => run("conversions"));
  const rows = ga4DbRows(
    pages.map((r) => ({ date: val(r, 0), page: val(r, 1), sessions: num(r, 0), conversions: num(r, 1) })),
    ai.map((r) => ({ date: val(r, 0), page: val(r, 1), source: val(r, 2), sessions: num(r, 0) })),
  );
  await upsert(db, "analytics_ga4", rows.map((r) => ({ brand_id: brand.id, workspace_id: brand.workspace_id, ...r })), "brand_id,day,page");
}

/**
 * One sync step for a brand. Returns true when more history is still to fetch (the job runs again soon).
 * GA4: the last 90 days the first time, then the last few days again each day (GA4 fills in late data).
 */
export async function syncAnalytics(db: SupabaseClient, brandId: string): Promise<boolean> {
  const g = await googleFor(db, brandId);
  if (!g?.conn) return false;
  const { brand, conn } = g;
  const state: SyncState = g.state ?? { gsc_from: null, gsc_to: null, ga4_to: null, backfilled: false, syncing: false, error: null, synced_at: null };
  await saveState(db, brand, { syncing: true });
  let more = false;
  try {
    const token = await accessToken(conn.refresh_token);
    if (brand.gsc_property && hasGscScope(conn.scopes)) {
      const w = gscWindows(state, today());
      if (w.newest) {
        await syncGscWindow(db, token, brand, w.newest);
        state.gsc_to = w.newest[1];
        state.gsc_from = state.gsc_from && state.gsc_from < w.newest[0] ? state.gsc_from : w.newest[0];
      }
      if (w.older) {
        await syncGscWindow(db, token, brand, w.older);
        state.gsc_from = w.older[0];
      }
      const next = gscWindows(state, today());
      state.backfilled = !next.older;
      more = !next.done;
    }
    if (brand.ga4_property) {
      const end = addDays(today(), -1);
      const start = state.ga4_to ? addDays(state.ga4_to, -3) : addDays(end, -(GA4_FIRST_DAYS - 1));
      await syncGa4(db, token, brand, start, end);
      state.ga4_to = end;
    }
    await saveState(db, brand, { gsc_from: state.gsc_from, gsc_to: state.gsc_to, ga4_to: state.ga4_to, backfilled: state.backfilled, syncing: more, error: null, synced_at: new Date().toISOString() });
    await computeOpportunities(db, brand, state);
    return more;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await saveState(db, brand, { syncing: false, error: message.slice(0, 500) });
    throw e;
  }
}

/** The job: one sync step, then the next step 20 seconds later while history is still coming in. */
export async function analyticsSyncJob(db: SupabaseClient, job: Job) {
  const brandId = String(job.payload.brandId ?? "");
  const more = await syncAnalytics(db, brandId);
  if (more) await retry(job.id, "Fetching more history", 20, { count: false });
  else await finish(job.id);
}

/** Sync now, for a new sign-in or a picked property. */
export const queueSyncNow = (brand: { id: string; workspace_id: string }) => enqueue("analytics_sync", { brandId: brand.id }, { workspaceId: brand.workspace_id, key: `analytics_sync:${brand.id}:${Date.now()}`, maxAttempts: 3 });

/** Called by the scheduler every 10 minutes: each connected brand once a day, spread over the early hours (UTC). */
export async function queueAnalyticsSyncs(db: SupabaseClient) {
  const { data: conns, error } = await db.from("ga4_connections").select("brand_id, workspace_id");
  if (error || !conns?.length) return;
  const { data: states } = await db.from("analytics_state").select("brand_id, synced_at").in("brand_id", conns.map((c) => c.brand_id));
  const last = new Map((states ?? []).map((s) => [s.brand_id as string, s.synced_at as string | null]));
  const now = new Date();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const day = today();
  const rows: Parameters<typeof enqueueMany>[0] = [];
  for (const c of conns) {
    let h = 7;
    for (const ch of String(c.brand_id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    if (minute < 60 + (h % 300)) continue; // between 01:00 and 06:00 UTC
    const at = last.get(c.brand_id as string);
    if (at && at.slice(0, 10) === day) continue;
    rows.push({ kind: "analytics_sync", workspace_id: c.workspace_id as string, key: `analytics_sync:${c.brand_id}:${day}`, payload: { brandId: c.brand_id } });
  }
  if (rows.length) await enqueueMany(rows);
}

// ─────────────── Reading ───────────────

type Rpc = { query?: string; page?: string; clicks: number | string; impressions: number | string; avg_position: number | string | null; sessions?: number | string; conversions?: number | string; ai_sessions?: number | string };
const N = (v: unknown) => Number(v ?? 0) || 0;

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data ?? []) as T[];
}

export async function queriesIn(db: SupabaseClient, brandId: string, from: string, to: string, limit = 1000): Promise<QueryAgg[]> {
  return (await rpc<Rpc>(db, "analytics_queries", { p_brand: brandId, p_from: from, p_to: to, p_limit: limit })).map((r) => ({ query: String(r.query), clicks: N(r.clicks), impressions: N(r.impressions), position: N(r.avg_position) }));
}
export async function pagesIn(db: SupabaseClient, brandId: string, from: string, to: string, limit = 1000): Promise<PageAgg[]> {
  return (await rpc<Rpc>(db, "analytics_pages", { p_brand: brandId, p_from: from, p_to: to, p_limit: limit })).map((r) => ({
    page: String(r.page),
    clicks: N(r.clicks),
    impressions: N(r.impressions),
    position: r.avg_position === null ? null : N(r.avg_position),
    sessions: N(r.sessions),
    conversions: N(r.conversions),
    ai_sessions: N(r.ai_sessions),
  }));
}
async function queryPagesIn(db: SupabaseClient, brandId: string, from: string, to: string, limit = 4000): Promise<QueryPageAgg[]> {
  return (await rpc<Rpc>(db, "analytics_query_pages", { p_brand: brandId, p_from: from, p_to: to, p_limit: limit })).map((r) => ({ query: String(r.query), page: String(r.page), clicks: N(r.clicks), impressions: N(r.impressions), position: N(r.avg_position) }));
}

/** The last day with Search Console data, or three days ago. */
export const lastDay = (state: { gsc_to: string | null } | null) => state?.gsc_to ?? addDays(today(), -GSC_LAG);

/** One page's searches over a date range, most impressions first. */
export async function pageQueriesIn(db: SupabaseClient, brandId: string, page: string, from: string, to: string, limit = 200): Promise<QueryAgg[]> {
  return (await rpc<Rpc>(db, "analytics_page_queries", { p_brand: brandId, p_page: page, p_from: from, p_to: to, p_limit: limit })).map((r) => ({ query: String(r.query), clicks: N(r.clicks), impressions: N(r.impressions), position: N(r.avg_position) }));
}

/** Totals for a few pages over one date range. Pages with no data come back empty. */
async function pageTotals(db: SupabaseClient, brandId: string, pages: string[], from: string, to: string): Promise<Map<string, Totals>> {
  const rows = await rpc<Rpc>(db, "analytics_page_totals", { p_brand: brandId, p_pages: pages, p_from: from, p_to: to });
  return new Map(rows.map((r) => [String(r.page), { clicks: N(r.clicks), impressions: N(r.impressions), position: r.avg_position === null ? null : N(r.avg_position), sessions: N(r.sessions), conversions: N(r.conversions), ai_sessions: N(r.ai_sessions) }]));
}

export type ArticleResult = { item_id: string; keyword: string; url: string; page: string; event: "published" | "refreshed"; at: string; days: number; full: boolean; result: Result | null };

/**
 * Before and after for the brand's published Calendar pieces with a live address, newest change first: the 28 days
 * before it went live (or was refreshed) against the days since, up to 28. `itemId` picks one piece.
 */
export async function articleResults(db: SupabaseClient, brandId: string, state: SyncState | null, opts: { itemId?: string; limit?: number } = {}): Promise<ArticleResult[]> {
  const { data: sites } = await db.from("sites").select("id").eq("brand_id", brandId);
  const ids = (sites ?? []).map((s) => s.id as string);
  if (!ids.length) return [];
  let q = db.from("calendar_items").select("id, keyword, url, current_url, published_at, refreshed_at").in("site_id", ids).eq("status", "published").not("published_at", "is", null);
  if (opts.itemId) q = q.eq("id", opts.itemId);
  const { data, error } = await q.order("published_at", { ascending: false }).limit(200);
  if (error) return []; // before supabase/105_analytics_results.sql runs
  type Row = { id: string; keyword: string; url: string | null; current_url: string | null; published_at: string; refreshed_at: string | null };
  const last = lastDay(state);
  const rows = ((data ?? []) as Row[])
    .filter((r) => r.url || r.current_url)
    .map((r) => ({ ...r, at: r.refreshed_at ?? r.published_at }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, opts.limit ?? 20);
  return Promise.all(
    rows.map(async (r): Promise<ArticleResult> => {
      const url = (r.url ?? r.current_url)!;
      const page = pagePath(url);
      const w = resultWindows(r.at, last);
      const base = { item_id: r.id, keyword: r.keyword, url, page, event: (r.refreshed_at ? "refreshed" : "published") as ArticleResult["event"], at: r.at, days: w?.afterDays ?? 0, full: w?.full ?? false };
      if (!w) return { ...base, result: null };
      const [before, after] = await Promise.all([pageTotals(db, brandId, [page], ...w.before), pageTotals(db, brandId, [page], ...w.after)]);
      return { ...base, result: compareResult(before.get(page) ?? NO_TOTALS, after.get(page) ?? NO_TOTALS, 28, w.afterDays) };
    }),
  );
}

/** The piece that did best since it went live: the most clicks, then sign-ups. Null when none has clicks yet. */
export function bestResult(list: ArticleResult[]): ArticleResult | null {
  const live = list.filter((r) => (r.result?.clicks.after ?? 0) > 0);
  return live.sort((a, b) => (b.result!.clicks.after ?? 0) - (a.result!.clicks.after ?? 0) || (b.result!.conversions.after ?? 0) - (a.result!.conversions.after ?? 0))[0] ?? null;
}

/**
 * The brand's own pages next to AI: GA4 visits from AI over the last `days` of data, joined with the pages the
 * tracked AI answers cite over the same days (runs.chats).
 */
export async function citedPages(db: SupabaseClient, brand: BrandRow, days: number, state: SyncState | null): Promise<CitedPage[]> {
  const to = lastDay(state);
  const from = addDays(to, -(days - 1));
  const [runs, pages] = await Promise.all([
    db.from("runs").select("chats").eq("brand_id", brand.id).gte("at", `${from}T00:00:00Z`).order("at", { ascending: false }).limit(400),
    pagesIn(db, brand.id, from, to, 1000),
  ]);
  type Chat = { engine: string; prompt: string; sources?: { url: string }[] | null };
  const chats = ((runs.data ?? []) as { chats: Chat[] | null }[]).flatMap((r) => r.chats ?? []);
  return citedByAi(pages, ownCitations(chats, brand.domain));
}

/** Work out and save the day's Opportunities from the last 28 days against the 28 before. */
export async function computeOpportunities(db: SupabaseClient, brand: BrandRow, state: { gsc_to: string | null }) {
  if (!state.gsc_to) return;
  const end = state.gsc_to;
  const start = addDays(end, -27);
  const [queries, pages, pagesPrev, queryPages] = await Promise.all([
    queriesIn(db, brand.id, start, end),
    pagesIn(db, brand.id, start, end),
    pagesIn(db, brand.id, addDays(start, -28), addDays(start, -1)),
    queryPagesIn(db, brand.id, start, end),
  ]);
  const opps = findOpportunities({ days: 28, queries, pages, pagesPrev, queryPages });
  await db.from("analytics_opportunities").delete().eq("brand_id", brand.id);
  if (opps.length) await upsert(db, "analytics_opportunities", opps.map((o) => ({ brand_id: brand.id, workspace_id: brand.workspace_id, ...o, computed_at: new Date().toISOString() })), "brand_id,id");
}

export type OverviewQuery = QueryAgg & { ctr: number; chance: Chance | null; page: string | null };
export type Overview = {
  from: string;
  to: string;
  kpis: { clicks: [number, number]; impressions: [number, number]; position: [number | null, number | null]; sessions: [number, number]; conversions: [number, number]; ai: [number, number] };
  series: { day: string; clicks: number; sessions: number }[];
  ai: { engine: string; sessions: number }[];
  queries: OverviewQuery[];
  pages: PageAgg[];
  opportunities: (Opportunity & { computed_at: string })[];
};

/** Everything the Analytics page shows for the last `days` days of data and the period before. */
export async function analyticsOverview(db: SupabaseClient, brandId: string, days: number, state: SyncState | null): Promise<Overview> {
  const to = lastDay(state);
  const from = addDays(to, -(days - 1));
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));
  const [gscDays, ga4Days, ai, queries, pages, opps, queryPages] = await Promise.all([
    db.from("analytics_gsc_days").select("day, clicks, impressions, position").eq("brand_id", brandId).gte("day", prevFrom).lte("day", to).order("day"),
    rpc<{ day: string; sessions: number; conversions: number; ai_sessions: number }>(db, "analytics_ga4_days", { p_brand: brandId, p_from: prevFrom, p_to: to }),
    rpc<{ engine: string; sessions: number }>(db, "analytics_ai", { p_brand: brandId, p_from: from, p_to: to }),
    queriesIn(db, brandId, from, to, 200),
    pagesIn(db, brandId, from, to, 50),
    db.from("analytics_opportunities").select("id, kind, title, page, query, gain_clicks, gain_signups, why, data, computed_at").eq("brand_id", brandId).order("gain_clicks", { ascending: false }),
    queryPagesIn(db, brandId, from, to, 2000),
  ]);
  // Each query's main page: the one with the most impressions for it.
  const pageOf = new Map<string, string>();
  for (const r of queryPages) if (!pageOf.has(r.query)) pageOf.set(r.query, r.page);
  const g = (gscDays.data ?? []) as { day: string; clicks: number; impressions: number; position: number | null }[];
  const inCur = (d: string) => d >= from && d <= to;
  const inPrev = (d: string) => d >= prevFrom && d <= prevTo;
  const sumBy = <T extends { day: string }>(rows: T[], f: (r: T) => number, pick: (d: string) => boolean) => rows.filter((r) => pick(String(r.day))).reduce((a, r) => a + N(f(r)), 0);
  const posOf = (pick: (d: string) => boolean) => {
    const rows = g.filter((r) => pick(r.day) && r.position);
    const imp = rows.reduce((a, r) => a + r.impressions, 0);
    return imp ? Math.round((rows.reduce((a, r) => a + N(r.position) * r.impressions, 0) / imp) * 10) / 10 : null;
  };
  const sessionsBy = new Map(ga4Days.map((r) => [String(r.day), N(r.sessions)]));
  const clicksBy = new Map(g.map((r) => [r.day, r.clicks]));
  const series: Overview["series"] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) series.push({ day: d, clicks: clicksBy.get(d) ?? 0, sessions: sessionsBy.get(d) ?? 0 });
  return {
    from,
    to,
    kpis: {
      clicks: [sumBy(g, (r) => r.clicks, inCur), sumBy(g, (r) => r.clicks, inPrev)],
      impressions: [sumBy(g, (r) => r.impressions, inCur), sumBy(g, (r) => r.impressions, inPrev)],
      position: [posOf(inCur), posOf(inPrev)],
      sessions: [sumBy(ga4Days, (r) => r.sessions, inCur), sumBy(ga4Days, (r) => r.sessions, inPrev)],
      conversions: [sumBy(ga4Days, (r) => r.conversions, inCur), sumBy(ga4Days, (r) => r.conversions, inPrev)],
      ai: [sumBy(ga4Days, (r) => r.ai_sessions, inCur), sumBy(ga4Days, (r) => r.ai_sessions, inPrev)],
    },
    series,
    ai: ai.map((r) => ({ engine: r.engine, sessions: N(r.sessions) })),
    queries: queries.map((q) => ({ ...q, ctr: q.impressions ? q.clicks / q.impressions : 0, chance: chanceOf(q), page: pageOf.get(q.query) ?? null })),
    pages,
    opportunities: ((opps.data ?? []) as (Opportunity & { computed_at: string })[]).map((o) => ({ ...o, gain_signups: o.gain_signups === null ? null : N(o.gain_signups) })),
  };
}

export type OwnRank = { position: number; impressions: number; clicks: number; ctr: number; page: string | null };

/** Where the brand ranks for each of these searches over the last 28 days of data, from Search Console. */
export async function ownRanks(db: SupabaseClient, brandId: string, queries: string[], state: SyncState | null): Promise<Record<string, OwnRank>> {
  const list = [...new Set(queries.map((q) => q.toLowerCase().trim()).filter(Boolean))].slice(0, 300);
  if (!list.length) return {};
  const to = lastDay(state);
  const { data } = await db.from("analytics_gsc").select("query, page, clicks, impressions, position").eq("brand_id", brandId).in("query", list).gte("day", addDays(to, -27)).lte("day", to).limit(50_000);
  const by = new Map<string, { clicks: number; impressions: number; weighted: number; pages: Map<string, number> }>();
  for (const r of (data ?? []) as { query: string; page: string; clicks: number; impressions: number; position: number }[]) {
    const x = by.get(r.query) ?? { clicks: 0, impressions: 0, weighted: 0, pages: new Map<string, number>() };
    x.clicks += r.clicks;
    x.impressions += r.impressions;
    x.weighted += r.position * r.impressions;
    x.pages.set(r.page, (x.pages.get(r.page) ?? 0) + r.impressions);
    by.set(r.query, x);
  }
  const out: Record<string, OwnRank> = {};
  for (const [q, x] of by) {
    if (!x.impressions) continue;
    const page = [...x.pages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    out[q] = { position: Math.round((x.weighted / x.impressions) * 10) / 10, impressions: x.impressions, clicks: x.clicks, ctr: x.clicks / x.impressions, page };
  }
  return out;
}
