// Google Search Console and Bing Webmaster Tools numbers, read through Composio (searchEnginesServer.ts).
// This file holds the plain parts: matching a brand's domain to the right property, and reading the replies.
// It has no imports, so the browser and the tests can use it too.

export type SearchTotals = { clicks: number; impressions: number; ctr: number; position: number | null };
export type SearchDay = { day: string; clicks: number; impressions: number };
export type SearchRow = { key: string; clicks: number; impressions: number; ctr: number; position: number | null };

/** What /api/search-console sends back for one engine. */
export type SearchReport =
  | { allowed: false }
  | { allowed: true; connected: false; ready: boolean }
  | { allowed: true; connected: true; property: null; sites: string[] }
  | {
      allowed: true;
      connected: true;
      property: string;
      from: string;
      to: string;
      current: SearchTotals;
      previous: SearchTotals;
      series: SearchDay[];
      queries: SearchRow[];
      pages: SearchRow[];
      at: string;
    };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const n = (v: unknown) => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
};
/** The first field that is there, in any letter case. Composio and the APIs differ (clicks or Clicks). */
const field = (o: Record<string, unknown>, ...names: string[]) => {
  for (const k of names) if (o[k] !== undefined && o[k] !== null) return o[k];
  const lower = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase().replace(/_/g, ""), v]));
  for (const k of names) {
    const v = lower[k.toLowerCase().replace(/_/g, "")];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};
/** Composio sometimes wraps the API's reply in response_data, sometimes not. */
const body = (data: unknown) => {
  const o = obj(data);
  return Object.keys(obj(o.response_data)).length ? obj(o.response_data) : o;
};

/** "https://www.Example.com/blog" → "example.com". */
export function bareHost(domain: string): string {
  const s = String(domain ?? "").trim().toLowerCase();
  const host = s.replace(/^sc-domain:/, "").replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  return host.replace(/^www\./, "");
}
const urlParts = (u: string) => {
  try {
    const x = new URL(u);
    return { https: x.protocol === "https:", host: x.hostname.toLowerCase(), path: x.pathname.replace(/\/+$/, "") || "/" };
  } catch {
    return null;
  }
};

// ─────────────── Google Search Console ───────────────

export type GscSite = { url: string; permission: string };

/** LIST_SITES → the properties this Google account can read. Unverified ones have no data, so they are left out. */
export function gscSites(data: unknown): GscSite[] {
  const b = body(data);
  const list = arr(field(b, "siteEntry", "site_entry", "sites"));
  return list
    .map((x) => obj(x))
    .map((x) => ({ url: String(field(x, "siteUrl", "site_url", "url") ?? "").trim(), permission: String(field(x, "permissionLevel", "permission_level") ?? "") }))
    .filter((s) => s.url && s.permission !== "siteUnverifiedUser");
}

const RANK: Record<string, number> = { siteOwner: 3, siteFullUser: 2, siteRestrictedUser: 1 };

/**
 * The Search Console property for a brand's domain, or null. A domain property (sc-domain:example.com) wins,
 * then the site's home page as a URL-prefix property (https first, and the www form the brand uses),
 * then a domain property for the parent domain, then a URL-prefix property for one folder.
 */
export function pickGscProperty(sites: GscSite[], domain: string): string | null {
  const host = bareHost(domain);
  if (!host) return null;
  const given = String(domain).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0];
  let best: { url: string; score: number } | null = null;
  for (const s of sites) {
    let score = 0;
    if (s.url.toLowerCase().startsWith("sc-domain:")) {
      const d = bareHost(s.url);
      if (d === host) score = 100;
      else if (host.endsWith(`.${d}`)) score = 60;
    } else {
      const u = urlParts(s.url);
      if (u && u.host.replace(/^www\./, "") === host) {
        score = u.path === "/" ? 80 : 40;
        if (u.https) score += 6;
        if (u.host === given) score += 3;
      }
    }
    if (!score) continue;
    score += (RANK[s.permission] ?? 0) / 10;
    if (!best || score > best.score) best = { url: s.url, score };
  }
  return best?.url ?? null;
}

/** One row of SEARCH_ANALYTICS_QUERY: its keys (date, query or page) and its numbers. */
export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

export function gscRows(data: unknown): GscRow[] {
  return arr(field(body(data), "rows")).map((x) => {
    const r = obj(x);
    return { keys: arr(r.keys).map(String), clicks: n(r.clicks), impressions: n(r.impressions), ctr: n(r.ctr), position: n(r.position) };
  });
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY = 864e5;
const dayStart = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

export type Range = { start: string; end: string; prevStart: string; prevEnd: string };

/** The chosen period and the one before. Search Console runs about two days behind, so the period ends `lag` days ago. */
export function periodRange(days: number, now: Date, lag = 0): Range {
  const end = dayStart(now) - lag * DAY;
  const start = end - (days - 1) * DAY;
  return { start: iso(start), end: iso(end), prevStart: iso(start - days * DAY), prevEnd: iso(start - DAY) };
}

/** Every day from start to end. */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`); t <= last && out.length < 400; t += DAY) out.push(iso(t));
  return out;
}

/** Add up days. Position is the average weighted by impressions, the way Search Console does it. */
export function totals(rows: { clicks: number; impressions: number; position?: number | null }[]): SearchTotals {
  let clicks = 0, impressions = 0, weighted = 0, seen = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    if (r.position && r.position > 0) {
      weighted += r.position * r.impressions;
      seen += r.impressions;
    }
  }
  return { clicks, impressions, ctr: impressions ? (clicks * 100) / impressions : 0, position: seen ? weighted / seen : null };
}

/** Daily rows (dimension "date") for both periods → totals for each, and a day-by-day series for the chosen one. */
export function gscSummary(daily: GscRow[], r: Range) {
  const byDay = new Map(daily.filter((x) => x.keys[0]).map((x) => [x.keys[0].slice(0, 10), x]));
  const pick = (from: string, to: string) => daily.filter((x) => (x.keys[0] ?? "").slice(0, 10) >= from && (x.keys[0] ?? "").slice(0, 10) <= to);
  return {
    current: totals(pick(r.start, r.end)),
    previous: totals(pick(r.prevStart, r.prevEnd)),
    series: daysBetween(r.start, r.end).map((day) => ({ day, clicks: byDay.get(day)?.clicks ?? 0, impressions: byDay.get(day)?.impressions ?? 0 })),
  };
}

/** Query or page rows → a short top list, most clicks first. */
export function topRows(rows: GscRow[], limit = 10): SearchRow[] {
  return rows
    .filter((r) => r.keys[0])
    .map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr * 100, position: r.position || null }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

// ─────────────── Bing Webmaster Tools ───────────────

export type BingSite = { url: string; verified: boolean };

export function bingSites(data: unknown): BingSite[] {
  const b = body(data);
  return arr(field(b, "sites", "d"))
    .map((x) => obj(x))
    .map((x) => ({ url: String(field(x, "url", "Url") ?? "").trim(), verified: field(x, "is_verified", "IsVerified") !== false }))
    .filter((s) => s.url);
}

/** The verified Bing site for a brand's domain: the home page first (https first), then a folder. */
export function pickBingSite(sites: BingSite[], domain: string): string | null {
  const host = bareHost(domain);
  if (!host) return null;
  const given = String(domain).trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0];
  let best: { url: string; score: number } | null = null;
  for (const s of sites) {
    const u = s.verified ? urlParts(s.url) : null;
    if (!u || u.host.replace(/^www\./, "") !== host) continue;
    const score = (u.path === "/" ? 80 : 40) + (u.https ? 6 : 0) + (u.host === given ? 3 : 0);
    if (!best || score > best.score) best = { url: s.url, score };
  }
  return best?.url ?? null;
}

/** The verified Bing site a page belongs to: same host, and the page sits under the site's folder. */
export function bingSiteForUrl(sites: BingSite[], pageUrl: string): string | null {
  const p = urlParts(pageUrl);
  if (!p) return null;
  let best: { url: string; score: number } | null = null;
  for (const s of sites) {
    const u = s.verified ? urlParts(s.url) : null;
    if (!u || u.host.replace(/^www\./, "") !== p.host.replace(/^www\./, "")) continue;
    if (u.path !== "/" && p.path !== u.path && !p.path.startsWith(`${u.path}/`)) continue;
    const score = (u.host === p.host ? 1000 : 0) + (u.https === p.https ? 500 : 0) + u.path.length;
    if (!best || score > best.score) best = { url: s.url, score };
  }
  return best?.url ?? null;
}

/** Bing dates come as ISO text, or as "/Date(1700000000000-0800)/" from the older API. */
export function bingDay(v: unknown): string | null {
  const s = String(v ?? "");
  // A plain date keeps its own day, whatever the server's time zone.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const ms = s.match(/\/Date\((-?\d+)/);
  const t = ms ? Number(ms[1]) : Date.parse(s);
  return Number.isFinite(t) && s ? iso(t) : null;
}

export type BingRow = { day: string | null; query: string; clicks: number; impressions: number };

export function bingRows(data: unknown): BingRow[] {
  return arr(field(body(data), "rows")).map((x) => {
    const r = obj(x);
    return { day: bingDay(field(r, "date")), query: String(field(r, "query", "page", "url") ?? ""), clicks: n(field(r, "clicks")), impressions: n(field(r, "impressions")) };
  });
}

/**
 * Bing's daily totals and its top queries → the same shape as Search Console. Bing keeps its own dates, so rows are
 * picked by day. Query rows come by the week, so a row dated up to six days before the period still counts.
 * Bing's positions use another scale, so they are left out.
 */
export function bingSummary(daily: BingRow[], queries: BingRow[], r: Range) {
  const inside = (d: string | null, from: string, to: string) => d !== null && d >= from && d <= to;
  const byDay = new Map<string, { clicks: number; impressions: number }>();
  for (const x of daily) {
    if (!x.day) continue;
    const had = byDay.get(x.day) ?? { clicks: 0, impressions: 0 };
    byDay.set(x.day, { clicks: had.clicks + x.clicks, impressions: had.impressions + x.impressions });
  }
  const sum = (from: string, to: string) => totals(daily.filter((x) => inside(x.day, from, to)));
  const weekBefore = iso(Date.parse(`${r.start}T00:00:00Z`) - 6 * DAY);
  const grouped = new Map<string, { clicks: number; impressions: number }>();
  for (const q of queries) {
    if (!q.query || (q.day !== null && !inside(q.day, weekBefore, r.end))) continue;
    const had = grouped.get(q.query) ?? { clicks: 0, impressions: 0 };
    grouped.set(q.query, { clicks: had.clicks + q.clicks, impressions: had.impressions + q.impressions });
  }
  const top: SearchRow[] = [...grouped]
    .map(([key, v]) => ({ key, ...v, ctr: v.impressions ? (v.clicks * 100) / v.impressions : 0, position: null }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 10);
  return {
    current: sum(r.start, r.end),
    previous: sum(r.prevStart, r.prevEnd),
    series: daysBetween(r.start, r.end).map((day) => ({ day, ...(byDay.get(day) ?? { clicks: 0, impressions: 0 }) })),
    queries: top,
  };
}
