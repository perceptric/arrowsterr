// Search Console and Chrome UX Report answers turned into what the Indexing and Speed screens show
// (docs/technical-seo-plan.md, phase 2). Pure, so the jobs, the routes and the tests read Google the same way.

// ---------- Search Console ----------

export type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
export type PageStat = { page: string; clicks: number; impressions: number; position: number };
export type DayStat = { day: string; clicks: number; impressions: number; position: number };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Search Analytics rows by page (dimension "page"), clicks first. */
export function pageStats(rows: GscRow[] | undefined): PageStat[] {
  return (rows ?? [])
    .filter((r) => r.keys?.[0])
    .map((r) => ({ page: r.keys![0], clicks: n(r.clicks), impressions: n(r.impressions), position: Math.round(n(r.position) * 10) / 10 }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

/** Search Analytics rows by date (dimension "date"), oldest first. */
export function dayStats(rows: GscRow[] | undefined): DayStat[] {
  return (rows ?? [])
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.keys?.[0] ?? ""))
    .map((r) => ({ day: r.keys![0], clicks: n(r.clicks), impressions: n(r.impressions), position: Math.round(n(r.position) * 10) / 10 }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Days as YYYY-MM-DD in UTC, n days before a date. Search Console data settles after about 2 days. */
export const dayBefore = (now: Date, days: number) => new Date(now.getTime() - days * 864e5).toISOString().slice(0, 10);

export type Inspection = {
  url: string;
  verdict: string;
  coverage: string;
  indexing: string;
  robots: string;
  fetch: string;
  googleCanonical: string | null;
  userCanonical: string | null;
  lastCrawl: string | null;
  crawledAs: string | null;
  mobile: string | null;
  rich: { type: string; errors: number; warnings: number }[];
  sitemaps: string[];
};

type RawInspection = {
  inspectionResult?: {
    indexStatusResult?: { verdict?: string; coverageState?: string; indexingState?: string; robotsTxtState?: string; pageFetchState?: string; googleCanonical?: string; userCanonical?: string; lastCrawlTime?: string; crawledAs?: string; sitemap?: string[] };
    mobileUsabilityResult?: { verdict?: string };
    richResultsResult?: { detectedItems?: { richResultType?: string; items?: { issues?: { severity?: string }[] }[] }[] };
  };
};

/** One URL Inspection answer as a row. */
export function readInspection(url: string, raw: RawInspection): Inspection {
  const r = raw.inspectionResult?.indexStatusResult ?? {};
  return {
    url,
    verdict: r.verdict ?? "VERDICT_UNSPECIFIED",
    coverage: r.coverageState ?? "Unknown",
    indexing: r.indexingState ?? "",
    robots: r.robotsTxtState ?? "",
    fetch: r.pageFetchState ?? "",
    googleCanonical: r.googleCanonical ?? null,
    userCanonical: r.userCanonical ?? null,
    lastCrawl: r.lastCrawlTime ?? null,
    crawledAs: r.crawledAs ?? null,
    mobile: raw.inspectionResult?.mobileUsabilityResult?.verdict ?? null,
    rich: (raw.inspectionResult?.richResultsResult?.detectedItems ?? []).map((d) => {
      const issues = (d.items ?? []).flatMap((i) => i.issues ?? []);
      return { type: d.richResultType ?? "Unknown", errors: issues.filter((i) => i.severity === "ERROR").length, warnings: issues.filter((i) => i.severity === "WARNING").length };
    }),
    sitemaps: r.sitemap ?? [],
  };
}

/** Indexed per Google: the verdict passes, or the coverage says so. */
export const isIndexed = (i: Pick<Inspection, "verdict" | "coverage">) => i.verdict === "PASS" || /indexed/i.test(i.coverage) && !/not indexed/i.test(i.coverage);

/** Google's canonical differs from the page's own, after cleaning trailing slashes and case of the host. */
export function otherCanonical(i: Pick<Inspection, "googleCanonical" | "userCanonical" | "url">): boolean {
  if (!i.googleCanonical) return false;
  const clean = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();
  const mine = i.userCanonical ?? i.url;
  return clean(i.googleCanonical) !== clean(mine);
}

/** "Crawled - currently not indexed" and "Discovered - currently not indexed": Google saw the page and passed. */
export const notIndexedValuable = (i: Pick<Inspection, "coverage">) => /currently not indexed/i.test(i.coverage);

/** Coverage states grouped for the chart, most common reasons named. */
export function coverageGroups(list: Pick<Inspection, "verdict" | "coverage">[]): { label: string; count: number; indexed: boolean }[] {
  const by = new Map<string, { count: number; indexed: boolean }>();
  for (const i of list) {
    const label = isIndexed(i) ? "Indexed" : i.coverage || "Unknown";
    const cur = by.get(label) ?? { count: 0, indexed: isIndexed(i) };
    cur.count++;
    by.set(label, cur);
  }
  return [...by.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => Number(b.indexed) - Number(a.indexed) || b.count - a.count);
}

/**
 * Which URLs to inspect today, in order: pages with clicks, then pages AI cites, then sitemap pages, then other
 * indexable pages; inside each, the ones never inspected first, then the longest ago. Skips anything inspected in the
 * last `minDays` days.
 */
export function pickInspections(
  candidates: { url: string; clicks: number; cited: boolean; inSitemap: boolean }[],
  last: Map<string, string>,
  budget: number,
  now: Date,
  minDays = 3,
): string[] {
  const tier = (c: (typeof candidates)[number]) => (c.clicks > 0 ? 0 : c.cited ? 1 : c.inSitemap ? 2 : 3);
  const age = (u: string) => (last.has(u) ? now.getTime() - Date.parse(last.get(u)!) : Infinity);
  const seen = new Set<string>();
  return candidates
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .filter((c) => age(c.url) > minDays * 864e5)
    .sort((a, b) => tier(a) - tier(b) || age(b.url) - age(a.url) || b.clicks - a.clicks)
    .slice(0, Math.max(0, budget))
    .map((c) => c.url);
}

/** The Search Console page that inspects one URL, for "Request indexing" (the API can't request it for normal pages). */
export const inspectLink = (siteUrl: string, url: string) => `https://search.google.com/search-console/inspect?${new URLSearchParams({ resource_id: siteUrl, id: url })}`;

/** The property that best matches a domain: the Domain property, else the longest URL-prefix property on that host. */
export function matchProperty(sites: { siteUrl: string; permissionLevel?: string }[], domain: string): string | null {
  const host = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const usable = sites.filter((s) => s.permissionLevel !== "siteUnverifiedUser");
  const dom = usable.find((s) => s.siteUrl.toLowerCase() === `sc-domain:${host}`);
  if (dom) return dom.siteUrl;
  const prefix = usable
    .filter((s) => /^https?:\/\//i.test(s.siteUrl) && new URL(s.siteUrl).hostname.replace(/^www\./, "").toLowerCase() === host)
    .sort((a, b) => Number(b.siteUrl.startsWith("https")) - Number(a.siteUrl.startsWith("https")) || a.siteUrl.length - b.siteUrl.length);
  return prefix[0]?.siteUrl ?? null;
}

export type SitemapStat = { path: string; lastDownloaded: string | null; lastSubmitted: string | null; pending: boolean; isIndex: boolean; errors: number; warnings: number; submitted: number; indexed: number };

/** The Sitemaps API's list as rows. */
export function readSitemaps(raw: { sitemap?: { path?: string; lastDownloaded?: string; lastSubmitted?: string; isPending?: boolean; isSitemapsIndex?: boolean; errors?: string | number; warnings?: string | number; contents?: { submitted?: string | number; indexed?: string | number }[] }[] }): SitemapStat[] {
  return (raw.sitemap ?? [])
    .filter((s) => s.path)
    .map((s) => ({
      path: s.path!,
      lastDownloaded: s.lastDownloaded ?? null,
      lastSubmitted: s.lastSubmitted ?? null,
      pending: Boolean(s.isPending),
      isIndex: Boolean(s.isSitemapsIndex),
      errors: n(s.errors),
      warnings: n(s.warnings),
      submitted: (s.contents ?? []).reduce((a, c) => a + n(c.submitted), 0),
      indexed: (s.contents ?? []).reduce((a, c) => a + n(c.indexed), 0),
    }));
}

// ---------- Chrome UX Report ----------

export type Metric = "lcp" | "inp" | "cls" | "ttfb" | "fcp";
export const METRICS: { id: Metric; key: string; label: string; good: number; poor: number; unit: "ms" | "" }[] = [
  { id: "lcp", key: "largest_contentful_paint", label: "Largest Contentful Paint", good: 2500, poor: 4000, unit: "ms" },
  { id: "inp", key: "interaction_to_next_paint", label: "Interaction to Next Paint", good: 200, poor: 500, unit: "ms" },
  { id: "cls", key: "cumulative_layout_shift", label: "Cumulative Layout Shift", good: 0.1, poor: 0.25, unit: "" },
  { id: "ttfb", key: "experimental_time_to_first_byte", label: "Time to First Byte", good: 800, poor: 1800, unit: "ms" },
  { id: "fcp", key: "first_contentful_paint", label: "First Contentful Paint", good: 1800, poor: 3000, unit: "ms" },
];
/** The three metrics that make up the Core Web Vitals verdict. */
export const CORE: Metric[] = ["lcp", "inp", "cls"];

export type Rating = "good" | "ni" | "poor";
export type MetricValue = { p75: number; good: number; ni: number; poor: number };
export type Vitals = Partial<Record<Metric, MetricValue>>;

export const rate = (m: Metric, v: number): Rating => {
  const d = METRICS.find((x) => x.id === m)!;
  return v <= d.good ? "good" : v <= d.poor ? "ni" : "poor";
};

type CruxMetric = { histogram?: { start?: number | string; end?: number | string; density?: number }[]; percentiles?: { p75?: number | string } };

/** A CrUX record's metrics: the 75th percentile and the good, needs work and poor shares (0 to 100). */
export function readVitals(raw: { record?: { metrics?: Record<string, CruxMetric> } }): Vitals {
  const out: Vitals = {};
  for (const m of METRICS) {
    const x = raw.record?.metrics?.[m.key];
    if (!x?.percentiles || x.percentiles.p75 === undefined) continue;
    const h = x.histogram ?? [];
    const pct = (i: number) => Math.round((h[i]?.density ?? 0) * 1000) / 10;
    out[m.id] = { p75: n(x.percentiles.p75), good: pct(0), ni: pct(1), poor: pct(2) };
  }
  return out;
}

/** Passes Core Web Vitals: every core metric with data is good at the 75th percentile. Null without LCP data. */
export function passes(v: Vitals): boolean | null {
  if (!v.lcp) return null;
  return CORE.every((m) => !v[m] || rate(m, v[m]!.p75) === "good");
}

export type HistoryPoint = { end: string; value: number | null };

type CruxHistory = { record?: { metrics?: Record<string, { percentilesTimeseries?: { p75s?: (number | string | null)[] } }>; collectionPeriods?: { lastDate?: { year: number; month: number; day: number } }[] } };

/** CrUX History: each metric's 75th percentile per collection period, oldest first. */
export function readHistory(raw: CruxHistory): Partial<Record<Metric, HistoryPoint[]>> {
  const ends = (raw.record?.collectionPeriods ?? []).map((p) => (p.lastDate ? `${p.lastDate.year}-${String(p.lastDate.month).padStart(2, "0")}-${String(p.lastDate.day).padStart(2, "0")}` : ""));
  const out: Partial<Record<Metric, HistoryPoint[]>> = {};
  for (const m of METRICS) {
    const p75s = raw.record?.metrics?.[m.key]?.percentilesTimeseries?.p75s;
    if (!p75s) continue;
    out[m.id] = p75s.map((v, i) => ({ end: ends[i] ?? "", value: v === null || v === undefined || v === "NaN" ? null : n(v) }));
  }
  return out;
}

/** A metric's value for people: 2.4 s, 180 ms, 0.04. */
export function showMetric(m: Metric, v: number): string {
  if (m === "cls") return v.toFixed(2);
  return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
}
