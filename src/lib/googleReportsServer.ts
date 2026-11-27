import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cached } from "./cache";
import { accessToken, activeNow, gscQuery, runReports, type ReportRow } from "./google";
import {
  addDay,
  addSearch,
  addVisits,
  byPath,
  ga4Requests,
  gscBody,
  gscHasQueries,
  NO_SUMS,
  sumsOf,
  trafficChannels,
  type ChannelRow,
  type DateRange,
  type Filter,
  type Ga4Dim,
  type Ga4Sums,
  type GscDim,
  type GscType,
  type PageSearch,
  type PageVisits,
} from "./googleReports";
import { gscRows } from "./searchEngines";
import { liveItems, pagesIn, queriesIn, type BrandRow, type Conn } from "./seoAnalyticsServer";

// The Analytics page's reports, live from Google: Search Console's searchAnalytics.query and GA4's runReport, each
// kept for a few hours per brand and settings (cache.ts). When Google fails, the reports fall back to the daily
// sync's tables (seoAnalyticsServer.ts), which have fewer parts. The pure parts are in googleReports.ts.

const HOURS = 36e5;
const ROWS = 1000; // per table; the page sorts and pages them
type Pin = { day: string; title: string; event: "published" | "refreshed" };

async function pinsFor(db: SupabaseClient, brandId: string, r: DateRange): Promise<Pin[]> {
  const live = await liveItems(db, brandId).catch(() => []);
  return live.filter((l) => l.at.slice(0, 10) >= r.from && l.at.slice(0, 10) <= r.to).map((l) => ({ day: l.at.slice(0, 10), title: l.title, event: l.event }));
}

const N = (v: unknown) => Number(v ?? 0) || 0;

// ─────────────── Search Console ───────────────

export type GscParams = { range: DateRange; prev: DateRange | null; type: GscType; filters: Filter<GscDim>[]; hourly: boolean };
export type GscTotals = { clicks: number; impressions: number; ctr: number | null; position: number | null };
export type GscPoint = { key: string; clicks: number; impressions: number; position: number | null };
export type GscItem = { key: string; clicks: number; impressions: number; ctr: number | null; position: number | null };
export type GscReport = {
  source: "live" | "synced";
  at: string; // when the numbers were read from Google
  hourly: boolean;
  totals: { cur: GscTotals; prev: GscTotals | null };
  series: GscPoint[];
  tables: Record<GscDim, GscItem[] | null>; // null: not available for this search type or source
  pins: Pin[];
};

const item = (keys: string[], r: { clicks: number; impressions: number; ctr: number; position: number }): GscItem => ({ key: keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? r.ctr : null, position: r.position || null });
const totalsOf = (points: GscPoint[]): GscTotals => {
  const clicks = points.reduce((a, p) => a + p.clicks, 0);
  const impressions = points.reduce((a, p) => a + p.impressions, 0);
  const placed = points.filter((p) => p.position !== null);
  const weight = placed.reduce((a, p) => a + p.impressions, 0);
  return { clicks, impressions, ctr: impressions ? clicks / impressions : null, position: weight ? placed.reduce((a, p) => a + p.position! * p.impressions, 0) / weight : null };
};

async function gscLive(token: string, site: string, p: GscParams): Promise<Omit<GscReport, "pins" | "source" | "at">> {
  const q = (range: DateRange, dims: string[], rowLimit?: number) => gscQuery(token, site, gscBody({ range, type: p.type, filters: p.filters, dims, rowLimit })).then(gscRows);
  const queries = gscHasQueries(p.type);
  const table = (dim: GscDim, on = true) => (on ? q(p.range, [dim], ROWS).then((rows) => rows.map((r) => item(r.keys, r))) : Promise.resolve(null));

  if (p.hourly) {
    // The last 24 hours by hour, and the 24 before them. Tables cover the two days the hours fall in.
    const rows = await q({ from: addDay(p.range.to, -3), to: p.range.to }, ["hour"], 200);
    const points = rows.map((r) => ({ key: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position || null })).sort((a, b) => a.key.localeCompare(b.key));
    const cur = points.slice(-24);
    const before = points.slice(-48, -24);
    const [query, page, country, device, searchAppearance] = await Promise.all([table("query", queries), table("page"), table("country"), table("device"), table("searchAppearance", queries).catch(() => null)]);
    return { hourly: true, totals: { cur: totalsOf(cur), prev: p.prev && before.length ? totalsOf(before) : null }, series: cur, tables: { query, page, country, device, searchAppearance } };
  }

  const total = (range: DateRange) => q(range, []).then((rows) => (rows[0] ? { clicks: rows[0].clicks, impressions: rows[0].impressions, ctr: rows[0].impressions ? rows[0].ctr : null, position: rows[0].position || null } : { clicks: 0, impressions: 0, ctr: null, position: null }));
  const [cur, prev, days, query, page, country, device, searchAppearance] = await Promise.all([
    total(p.range),
    p.prev ? total(p.prev) : Promise.resolve(null),
    q(p.range, ["date"], 1000),
    table("query", queries),
    table("page"),
    table("country"),
    table("device"),
    // Search appearance can't be split with some filters; the rest of the report still loads.
    table("searchAppearance", queries).catch(() => null),
  ]);
  const series = days.map((r) => ({ key: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position || null })).sort((a, b) => a.key.localeCompare(b.key));
  return { hourly: false, totals: { cur, prev }, series, tables: { query, page, country, device, searchAppearance } };
}

/** The synced copy (web search, no filters): totals, days, queries and pages. */
async function gscSynced(db: SupabaseClient, brandId: string, p: GscParams): Promise<Omit<GscReport, "pins" | "source" | "at">> {
  const from = p.prev && p.prev.from < p.range.from ? p.prev.from : p.range.from;
  const { data, error } = await db.from("analytics_gsc_days").select("day, clicks, impressions, position").eq("brand_id", brandId).gte("day", from).lte("day", p.range.to).order("day");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { day: string; clicks: number; impressions: number; position: number | null }[];
  const points = (r: DateRange) => rows.filter((x) => x.day >= r.from && x.day <= r.to).map((x) => ({ key: x.day, clicks: N(x.clicks), impressions: N(x.impressions), position: x.position === null ? null : N(x.position) }));
  const series = points(p.range);
  const [qs, ps] = await Promise.all([queriesIn(db, brandId, p.range.from, p.range.to, ROWS), pagesIn(db, brandId, p.range.from, p.range.to, ROWS)]);
  const row = (key: string, x: { clicks: number; impressions: number; position: number | null }) => ({ key, clicks: x.clicks, impressions: x.impressions, ctr: x.impressions ? x.clicks / x.impressions : null, position: x.position || null });
  return {
    hourly: false,
    totals: { cur: totalsOf(series), prev: p.prev ? totalsOf(points(p.prev)) : null },
    series,
    tables: { query: qs.map((x) => row(x.query, x)), page: ps.map((x) => row(x.page, x)), country: null, device: null, searchAppearance: null },
  };
}

/** The Search Console report for these settings. Read from Google at most every 3 hours (20 minutes by hour). */
export async function gscReport(db: SupabaseClient, brand: BrandRow, conn: Conn, p: GscParams): Promise<GscReport> {
  const site = brand.gsc_property!;
  const key = `gsc-report:v1:${brand.id}:${site}:${JSON.stringify(p)}`;
  try {
    const { data } = await cached(key, p.hourly ? HOURS / 3 : 3 * HOURS, async () => ({ ...(await gscLive(await accessToken(conn.refresh_token), site, p)), at: new Date().toISOString() }));
    return { ...data, source: "live", pins: await pinsFor(db, brand.id, p.range) };
  } catch (e) {
    if (p.hourly || p.filters.length || p.type !== "web") throw e;
    const synced = await gscSynced(db, brand.id, p).catch(() => null);
    if (!synced || !synced.series.length) throw e;
    const { data: state } = await db.from("analytics_state").select("synced_at").eq("brand_id", brand.id).maybeSingle();
    return { ...synced, source: "synced", at: String(state?.synced_at ?? new Date().toISOString()), pins: await pinsFor(db, brand.id, p.range) };
  }
}

// ─────────────── Google Analytics 4 ───────────────

export type Ga4Params = { range: DateRange; prev: DateRange | null; filters: Filter<Ga4Dim>[]; hourly: boolean };
export type Ga4Item = { key: string; sums: Ga4Sums };
export type Ga4Page = { key: string; views: number; users: number; duration: number; active: number; keyEvents: number };
export type Ga4Event = { key: string; count: number; prev: number | null };
export type Ga4Report = {
  source: "live" | "synced";
  at: string;
  hourly: boolean;
  totals: { cur: Ga4Sums; prev: Ga4Sums | null };
  series: ({ key: string } & Ga4Sums)[];
  channels: ChannelRow[];
  sourceMedium: Ga4Item[];
  campaigns: Ga4Item[];
  landing: Ga4Item[];
  pages: Ga4Page[];
  events: Ga4Event[];
  countries: Ga4Item[];
  devices: Ga4Item[];
  pins: Pin[];
};

const dim = (r: ReportRow, i: number) => r.dimensionValues?.[i]?.value ?? "";
const mets = (r: ReportRow) => (r.metricValues ?? []).map((m) => Number(m.value) || 0);
/** "20261126" → "2026-11-26", "2026112614" → "2026-11-26T14". */
const dayKey = (s: string) => (s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}${s.length === 10 ? `T${s.slice(8, 10)}` : ""}` : s);

async function ga4Live(token: string, property: string, p: Ga4Params): Promise<Omit<Ga4Report, "pins" | "source" | "at">> {
  const run = (keyMetric: string) => runReports(token, property, ga4Requests({ ...p, keyMetric }));
  const [totals, series, channels, ai, sourceMedium, campaigns, landing, pages, events, countries, devices] = await run("keyEvents").catch(() => run("conversions"));
  const ranged = (rows: ReportRow[], name: string, at: number) => rows.filter((r) => (p.prev ? dim(r, at) === name : true));
  const one = (rows: ReportRow[], name: string) => (ranged(rows, name, 0)[0] ? sumsOf(mets(ranged(rows, name, 0)[0])) : { ...NO_SUMS });
  const list = (rows: ReportRow[]) => rows.map((r) => ({ key: dim(r, 0) || "(not set)", sums: sumsOf(mets(r)) }));
  const eventPrev = new Map(p.prev ? ranged(events, "prev", 1).map((r) => [dim(r, 0), mets(r)[0]]) : []);
  return {
    hourly: p.hourly,
    totals: { cur: one(totals, "cur"), prev: p.prev ? one(totals, "prev") : null },
    series: series.map((r) => ({ key: dayKey(dim(r, 0)), ...sumsOf(mets(r)) })).sort((a, b) => a.key.localeCompare(b.key)),
    channels: trafficChannels(
      channels.map((r) => ({ channel: dim(r, 0), sums: sumsOf(mets(r)) })),
      ai.map((r) => ({ source: dim(r, 0), channel: dim(r, 1), sums: sumsOf(mets(r)) })),
    ),
    sourceMedium: list(sourceMedium),
    campaigns: list(campaigns),
    landing: list(landing),
    pages: pages.map((r) => {
      const m = mets(r);
      return { key: dim(r, 0) || "(not set)", views: m[0], users: m[1], duration: m[2], active: m[3], keyEvents: m[4] };
    }),
    events: ranged(events, "cur", 1)
      .map((r) => ({ key: dim(r, 0), count: mets(r)[0], prev: p.prev ? (eventPrev.get(dim(r, 0)) ?? 0) : null }))
      .filter((e) => e.count > 0 || (e.prev ?? 0) > 0)
      .sort((a, b) => b.count - a.count),
    countries: list(countries),
    devices: list(devices),
  };
}

/** The synced copy (no filters): sessions and key events by day, and landing pages. */
async function ga4Synced(db: SupabaseClient, brandId: string, p: Ga4Params): Promise<Omit<Ga4Report, "pins" | "source" | "at">> {
  const from = p.prev && p.prev.from < p.range.from ? p.prev.from : p.range.from;
  const { data, error } = await db.rpc("analytics_ga4_days", { p_brand: brandId, p_from: from, p_to: p.range.to });
  if (error) throw new Error(error.message);
  const days = ((data ?? []) as { day: string; sessions: number; conversions: number }[]).map((d) => ({ key: String(d.day).slice(0, 10), ...NO_SUMS, sessions: N(d.sessions), keyEvents: N(d.conversions) }));
  const sum = (r: DateRange) => days.filter((d) => d.key >= r.from && d.key <= r.to).reduce((a, d) => ({ ...a, sessions: a.sessions + d.sessions, keyEvents: a.keyEvents + d.keyEvents }), { ...NO_SUMS });
  const pages = await pagesIn(db, brandId, p.range.from, p.range.to, ROWS);
  return {
    hourly: false,
    totals: { cur: sum(p.range), prev: p.prev ? sum(p.prev) : null },
    series: days.filter((d) => d.key >= p.range.from),
    channels: [],
    sourceMedium: [],
    campaigns: [],
    landing: pages.filter((x) => x.sessions).map((x) => ({ key: x.page, sums: { ...NO_SUMS, sessions: x.sessions, keyEvents: x.conversions } })),
    pages: [],
    events: [],
    countries: [],
    devices: [],
  };
}

/** The GA4 report for these settings. Read from Google at most every 3 hours (20 minutes for today). */
export async function ga4Report(db: SupabaseClient, brand: BrandRow, conn: Conn, p: Ga4Params): Promise<Ga4Report> {
  const property = brand.ga4_property!;
  const key = `ga4-report:v1:${brand.id}:${property}:${JSON.stringify(p)}`;
  try {
    const { data } = await cached(key, p.hourly ? HOURS / 3 : 3 * HOURS, async () => ({ ...(await ga4Live(await accessToken(conn.refresh_token), property, p)), at: new Date().toISOString() }));
    return { ...data, source: "live", pins: await pinsFor(db, brand.id, p.range) };
  } catch (e) {
    if (p.hourly || p.filters.length) throw e;
    const synced = await ga4Synced(db, brand.id, p).catch(() => null);
    if (!synced || !synced.series.length) throw e;
    const { data: state } = await db.from("analytics_state").select("synced_at").eq("brand_id", brand.id).maybeSingle();
    return { ...synced, source: "synced", at: String(state?.synced_at ?? new Date().toISOString()), pins: await pinsFor(db, brand.id, p.range) };
  }
}

/** People on the site now, from GA4's realtime report. Kept for a minute. */
export async function ga4Now(brand: BrandRow, conn: Conn) {
  const { data } = await cached(`ga4-now:${brand.id}:${brand.ga4_property}`, 60_000, async () => activeNow(await accessToken(conn.refresh_token), brand.ga4_property!));
  return data;
}

// ─────────────── The other side's columns, joined by page path ───────────────

/** Search Console clicks and position for each page path (the Landing pages table's extra columns). */
export async function gscByPath(brand: BrandRow, conn: Conn, range: DateRange): Promise<PageSearch[]> {
  const { data } = await cached(`gsc-paths:v1:${brand.id}:${brand.gsc_property}:${range.from}:${range.to}`, 3 * HOURS, async () => {
    const rows = gscRows(await gscQuery(await accessToken(conn.refresh_token), brand.gsc_property!, gscBody({ range, type: "web", filters: [], dims: ["page"], rowLimit: 5000 })));
    const list = rows.map((r) => ({ path: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: r.position || null }));
    return [...byPath(list, (r) => r.path, addSearch).entries()].map(([path, r]) => ({ ...r, path }));
  });
  return data;
}

/** GA4 sessions and key events for each landing page path (the Pages table's GA4 columns). */
export async function ga4ByPath(brand: BrandRow, conn: Conn, range: DateRange): Promise<PageVisits[]> {
  const { data } = await cached(`ga4-paths:v1:${brand.id}:${brand.ga4_property}:${range.from}:${range.to}`, 3 * HOURS, async () => {
    const token = await accessToken(conn.refresh_token);
    const run = (keyMetric: string) => runReports(token, brand.ga4_property!, [{ dateRanges: [{ startDate: range.from, endDate: range.to }], dimensions: [{ name: "landingPage" }], metrics: [{ name: "sessions" }, { name: keyMetric }], limit: 5000 }]);
    const [rows] = await run("keyEvents").catch(() => run("conversions"));
    const list = rows.map((r) => ({ path: dim(r, 0), sessions: mets(r)[0] ?? 0, keyEvents: mets(r)[1] ?? 0 }));
    return [...byPath(list, (r) => r.path, addVisits).entries()].map(([path, r]) => ({ ...r, path }));
  });
  return data;
}

/** The page with the most impressions for one search, for Research on a query. */
export async function gscTopPage(brand: BrandRow, conn: Conn, query: string, range: DateRange): Promise<string | null> {
  const { data } = await cached(`gsc-top-page:v1:${brand.id}:${brand.gsc_property}:${range.from}:${range.to}:${query}`, 3 * HOURS, async () => {
    const rows = gscRows(await gscQuery(await accessToken(conn.refresh_token), brand.gsc_property!, gscBody({ range, type: "web", filters: [{ dim: "query", op: "equals", value: query }], dims: ["page"], rowLimit: 10 })));
    return [...rows].sort((a, b) => b.impressions - a.impressions)[0]?.keys[0] ?? null;
  });
  return data;
}
