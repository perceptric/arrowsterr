// Google Search Console and Bing Webmaster Tools: matching a brand's domain to the right property, and reading the
// site lists and rows the APIs send back (Analytics sync in seoAnalyticsServer.ts, Bing indexing in indexing.ts).
// It has no imports, so the browser and the tests can use it too.

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

export type BingSite = { url: string; verified: boolean };

export function bingSites(data: unknown): BingSite[] {
  const b = body(data);
  return arr(field(b, "sites", "d"))
    .map((x) => obj(x))
    .map((x) => ({ url: String(field(x, "url", "Url") ?? "").trim(), verified: field(x, "is_verified", "IsVerified") !== false }))
    .filter((s) => s.url);
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
