import "server-only";
import { readCache, writeCache } from "./cache";
import { runAppTool, type AppSlug } from "./composio";
import { charge } from "./meter";
import {
  bingRows,
  bingSites,
  bingSummary,
  gscRows,
  gscSites,
  gscSummary,
  periodRange,
  pickBingSite,
  pickGscProperty,
  topRows,
  type BingSite,
  type GscSite,
  type SearchReport,
} from "./searchEngines";

// Search Console and Bing numbers for the Traffic page, through the workspace's Composio connections.
// Composio bills every call, so the site lists and reports are saved for hours (cache.ts).

const HOUR = 36e5;
const REPORT_AGE = 6 * HOUR;
const SITES_AGE = 6 * HOUR;
// When no property matches, look again sooner: the person may be adding it right now.
const MISS_AGE = 30 * 60_000;

/** One Composio tool call, counted on the meter when there is one. */
function tool<T>(ws: string, slug: AppSlug, name: string, args: Record<string, unknown>) {
  charge("composio", 0.005);
  return runAppTool<T>(ws, slug, name, args);
}

/** The site list, saved per workspace. A saved list with no match is checked again after half an hour. */
async function siteList<S>(key: string, load: () => Promise<S[]>, matches: (sites: S[]) => boolean): Promise<S[]> {
  const hit = await readCache<{ at: number; sites: S[] }>(key, SITES_AGE);
  if (hit && Array.isArray(hit.sites) && (matches(hit.sites) || Date.now() - hit.at < MISS_AGE)) return hit.sites;
  const sites = await load();
  await writeCache(key, { at: Date.now(), sites });
  return sites;
}

export const gscSiteList = (ws: string, domain = "") =>
  siteList<GscSite>(`composio:gsc:sites:${ws}`, async () => gscSites(await tool(ws, "google_search_console", "GOOGLE_SEARCH_CONSOLE_LIST_SITES", {})), (s) => !domain || Boolean(pickGscProperty(s, domain)));

export const bingSiteList = (ws: string, matches: (s: BingSite[]) => boolean = () => true) =>
  siteList<BingSite>(`composio:bing:sites:${ws}`, async () => bingSites(await tool(ws, "bing_webmaster_tools", "BING_WEBMASTER_TOOLS_LIST_SITES", {})), matches);

/** Search Console for the brand's domain: the chosen period and the one before, by day, plus top queries and pages. */
export async function gscReport(ws: string, domain: string, days: number): Promise<SearchReport> {
  const sites = await gscSiteList(ws, domain);
  const property = pickGscProperty(sites, domain);
  if (!property) return { allowed: true, connected: true, property: null, sites: sites.map((s) => s.url).slice(0, 20) };
  // Search Console runs two or three days behind.
  const r = periodRange(days, new Date(), 3);
  const key = `composio:gsc:report:${ws}:${property}:${days}:${r.end}`;
  const hit = await readCache<SearchReport>(key, REPORT_AGE);
  if (hit) return hit;
  const query = (dimensions: string[], start: string, end: string, row_limit: number) =>
    tool(ws, "google_search_console", "GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY", { site_url: property, start_date: start, end_date: end, dimensions, row_limit, search_type: "web", data_state: "all" });
  const [daily, queries, pages] = await Promise.all([query(["date"], r.prevStart, r.end, 400), query(["query"], r.start, r.end, 25), query(["page"], r.start, r.end, 25)]);
  const report: SearchReport = {
    allowed: true,
    connected: true,
    property,
    from: r.start,
    to: r.end,
    ...gscSummary(gscRows(daily), r),
    queries: topRows(gscRows(queries)),
    pages: topRows(gscRows(pages)),
    at: new Date().toISOString(),
  };
  await writeCache(key, report);
  return report;
}

/** Bing for the brand's domain: clicks and impressions for the period and the one before, plus top queries. */
export async function bingReport(ws: string, domain: string, days: number): Promise<SearchReport> {
  const sites = await bingSiteList(ws, (s) => Boolean(pickBingSite(s, domain)));
  const site = pickBingSite(sites, domain);
  if (!site) return { allowed: true, connected: true, property: null, sites: sites.map((s) => s.url).slice(0, 20) };
  // Bing's daily numbers also run a day or two behind.
  const r = periodRange(days, new Date(), 1);
  const key = `composio:bing:report:${ws}:${site}:${days}:${r.end}`;
  const hit = await readCache<SearchReport>(key, REPORT_AGE);
  if (hit) return hit;
  const perf = (report: string) => tool(ws, "bing_webmaster_tools", "BING_WEBMASTER_TOOLS_GET_SEARCH_PERFORMANCE", { site_url: site, report });
  const [daily, queries] = await Promise.all([perf("daily_totals"), perf("top_queries")]);
  const report: SearchReport = { allowed: true, connected: true, property: site, from: r.start, to: r.end, ...bingSummary(bingRows(daily), bingRows(queries), r), pages: [], at: new Date().toISOString() };
  await writeCache(key, report);
  return report;
}
