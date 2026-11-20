import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReport, chunks, CLOUDFLARE_SETTINGS, cloudflareQuery, cloudflareWindow, dayList, fromCloudflare, fromConnector, type CrawlerReport, type CrawlRow } from "./aiCrawlers";
import { composioReady, hasApp, runAppTool, userOf, type AppOwner } from "./composio";
import { findPages } from "./sitemap";
import { wpClient } from "./wpSyncServer";

// The AI crawler report for one brand's site (aiCrawlers.ts has the rules). Two sources:
//   Cloudflare, through the workspace's Apps for Zippie connection (Composio): GraphQL Analytics, every plan.
//     A brand a partner made uses its own connection instead (POST /api/partner/brands/:id/connect/start).
//   WordPress, through the Arrowsterr Connector plugin (1.3.0 and up): GET /arrowsterr/v1/crawlers.
// Cloudflare sees every request, cached pages too, so it wins when both work.

export type SourceState = { state: "ok" | "off" | "missing" | "old" | "error"; note?: string };
export type CrawlerData = CrawlerReport & {
  source: "cloudflare" | "wordpress" | null;
  from: string;
  to: string;
  days: number;
  cloudflare: SourceState & { zone?: string; plan?: string; back?: number };
  wordpress: SourceState & { site?: string; pageCache?: boolean; since?: string | null };
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const say = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const host = (d: string) => d.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "").toLowerCase();
const CONNECTOR_MIN = "1.3.0";
const atLeast = (v: string, min: string) => {
  const a = v.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
};

type Zone = { id: string; name: string; plan?: { name?: string } };
const zones = new Map<string, { at: number; zone: Zone | null; win: ReturnType<typeof cloudflareWindow> }>();

/** The brand's Cloudflare zone and how far back it can query, kept for a day. */
async function cloudflareZone(ws: AppOwner, domain: string) {
  const key = `${userOf(ws)}:${domain}`;
  const hit = zones.get(key);
  if (hit && Date.now() - hit.at < 86_400_000) return hit;
  // The zone may be the bare domain or a parent of a subdomain.
  const parts = domain.split(".");
  let zone: Zone | null = null;
  for (let i = 0; i < parts.length - 1 && !zone; i++) {
    const name = parts.slice(i).join(".");
    const out = await runAppTool<{ result?: Zone[] }>(ws, "cloudflare", "CLOUDFLARE_LIST_ZONES", { name, status: "active" });
    zone = (out?.result ?? []).find((z) => z.name?.toLowerCase() === name) ?? null;
  }
  let win = cloudflareWindow(null);
  if (zone) {
    const s = await runAppTool<{ data?: unknown }>(ws, "cloudflare", "CLOUDFLARE_QUERY_GRAPHQL_ANALYTICS", { query: CLOUDFLARE_SETTINGS, variables: { zone: zone.id } }).catch(() => null);
    win = cloudflareWindow(s?.data ?? null);
  }
  const row = { at: Date.now(), zone, win };
  zones.set(key, row);
  return row;
}

async function fromCloudflareApp(ws: AppOwner, domain: string, days: number): Promise<{ rows: CrawlRow[]; state: CrawlerData["cloudflare"] }> {
  if (!composioReady() || !(await hasApp(ws, "cloudflare"))) return { rows: [], state: { state: "off" } };
  const { zone, win } = await cloudflareZone(ws, domain);
  if (!zone) return { rows: [], state: { state: "missing", note: `No active Cloudflare zone for ${domain} on the connected account.` } };
  if (!win.enabled) return { rows: [], state: { state: "error", note: "This Cloudflare plan can't read request analytics.", zone: zone.name, plan: zone.plan?.name } };
  // Lower plans look back fewer days, so ask only for days the zone can still read.
  const back = Math.min(days, win.back);
  const list = dayList(daysAgo(back - 1), today());
  const parts = chunks(list, win.width).slice(-31);
  const out = await runAppTool<{ data?: unknown; errors?: { message?: string }[] }>(ws, "cloudflare", "CLOUDFLARE_QUERY_GRAPHQL_ANALYTICS", { query: cloudflareQuery(parts, Math.min(win.pageSize, 2000)), variables: { zone: zone.id } });
  if (!out?.data && out?.errors?.length) throw new Error(`Cloudflare: ${out.errors[0]?.message ?? "the query failed"}`);
  return { rows: fromCloudflare(out?.data ?? null, parts), state: { state: "ok", zone: zone.name, plan: zone.plan?.name, back } };
}

async function fromWordPress(db: SupabaseClient, ws: string, brandId: string, days: number): Promise<{ rows: CrawlRow[]; pages: string[]; state: CrawlerData["wordpress"] }> {
  const { data: conns } = await db.from("cms_connections").select("id, name, config").eq("workspace_id", ws).eq("brand_id", brandId).eq("kind", "wordpress").order("created_at");
  const conn = (conns ?? [])[0] as { id: string; name: string; config: Record<string, string> } | undefined;
  if (!conn) return { rows: [], pages: [], state: { state: "off" } };
  const wp = wpClient(conn.config);
  const r = await wp.req("GET", `/arrowsterr/v1/crawlers?days=${days}`);
  const d = r.data as { version?: string; rows?: unknown; pages?: unknown; page_cache?: boolean; since?: string | null; logging?: boolean; message?: string };
  if (r.status === 404) {
    const s = await wp.req("GET", "/arrowsterr/v1/status").catch(() => null);
    const v = s?.status === 200 ? String((s.data as { version?: string }).version ?? "") : "";
    return { rows: [], pages: [], state: v ? { state: "old", site: conn.name, note: `The Arrowsterr Connector on ${conn.name} is ${v}. Update it to ${CONNECTOR_MIN} or newer.` } : { state: "missing", site: conn.name, note: `Install the Arrowsterr Connector plugin on ${conn.name}.` } };
  }
  if (r.status === 401 || r.status === 403) return { rows: [], pages: [], state: { state: "error", site: conn.name, note: "WordPress refused the sign-in. Check the site's application password." } };
  if (r.status >= 300) return { rows: [], pages: [], state: { state: "error", site: conn.name, note: `${conn.name} answered ${r.status}${d?.message ? `: ${String(d.message).slice(0, 200)}` : ""}.` } };
  if (d.version && !atLeast(d.version, CONNECTOR_MIN)) return { rows: [], pages: [], state: { state: "old", site: conn.name, note: `Update the Arrowsterr Connector on ${conn.name} to ${CONNECTOR_MIN} or newer.` } };
  const pages = Array.isArray(d.pages) ? d.pages.filter((p): p is string => typeof p === "string").slice(0, 300) : [];
  return {
    rows: fromConnector(d),
    pages,
    state: { state: d.logging === false ? "error" : "ok", site: conn.name, pageCache: Boolean(d.page_cache), since: d.since ?? null, ...(d.logging === false ? { note: "Counting is turned off on this site by a filter." } : {}) },
  };
}

const cache = new Map<string, { at: number; data: CrawlerData }>();
const TTL = 15 * 60_000;

/**
 * The crawler report for one brand over the last `days` days. Cached for 15 minutes; fresh reads again after a minute.
 * partner: the brand was made through the partner API, so Cloudflare is the brand's own connection, not the workspace's.
 */
export async function crawlerData(db: SupabaseClient, ws: string, brand: { id: string; domain: string; partner?: boolean }, days: number, fresh = false): Promise<CrawlerData> {
  const span = Math.max(1, Math.min(90, Math.round(days)));
  const key = `${brand.id}:${span}`;
  const hit = cache.get(key);
  // Each Cloudflare read is a paid app call, so even a fresh read waits a minute.
  if (hit && Date.now() - hit.at < (fresh ? 60_000 : TTL)) return hit.data;
  const domain = host(brand.domain);

  const [cf, wp] = await Promise.all([
    fromCloudflareApp(brand.partner ? { brand: brand.id } : ws, domain, span).catch((e): Awaited<ReturnType<typeof fromCloudflareApp>> => ({ rows: [], state: { state: "error", note: say(e) } })),
    fromWordPress(db, ws, brand.id, span).catch((e): Awaited<ReturnType<typeof fromWordPress>> => ({ rows: [], pages: [], state: { state: "error", note: say(e) } })),
  ]);
  const source = cf.state.state === "ok" ? "cloudflare" : wp.state.state === "ok" ? "wordpress" : null;
  const rows = source === "cloudflare" ? cf.rows : source === "wordpress" ? wp.rows : [];
  // Key pages: the WordPress list when there is one, then the sitemap. Homepage first.
  let important = wp.pages;
  if (source && !important.length) {
    const map = await findPages(domain).catch(() => ({ pages: [] as { url: string; article: boolean }[] }));
    const list = [...map.pages].sort((a, b) => Number(a.article) - Number(b.article)).map((p) => p.url);
    important = ["/", ...list.slice(0, 300)];
  }
  // A Cloudflare zone with a shorter history covers fewer days than asked.
  const covered = source === "cloudflare" ? Math.min(span, cf.state.back ?? span) : span;
  const from = daysAgo(covered - 1);
  const to = today();
  const data: CrawlerData = { ...buildReport(rows, important, from, to), source, from, to, days: covered, cloudflare: cf.state, wordpress: wp.state };
  cache.set(key, { at: Date.now(), data });
  return data;
}
