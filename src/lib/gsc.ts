import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessToken, api, seal } from "./google";
import { enqueue, enqueueMany } from "./jobs";
import { dayBefore, dayStats, isIndexed, matchProperty, pageStats, pickInspections, readInspection, readSitemaps, type GscRow, type Inspection } from "./tech/google";

// Google Search Console for Technical SEO, Indexing (docs/technical-seo-plan.md, phase 2): the sign-in, the brand's
// property, a daily sync of clicks by day and by page and of sitemaps, and URL Inspection within Google's limit of
// 2,000 a day per property (we use up to 1,500, so other tools the customer uses keep some).

const WM = "https://www.googleapis.com/webmasters/v3";
const INSPECT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
export const INSPECT_PER_DAY = 1500;
const JOB_MS = 170_000;
const LABEL = "Search Console";

type Conn = { brand_id: string; workspace_id: string; refresh_token: string; backfilled_at: string | null; inspect_day: string | null; inspected_today: number };
const enc = (s: string) => encodeURIComponent(s);

export async function listSites(token: string) {
  const r = await api<{ siteEntry?: { siteUrl: string; permissionLevel?: string }[] }>(`${WM}/sites`, token, undefined, LABEL);
  return r.siteEntry ?? [];
}

/** Save a new Search Console sign-in and pick the brand's property when one clearly matches. Returns the property. */
export async function connectGsc(db: SupabaseClient, c: { brandId: string; workspaceId: string; userId: string; refresh: string; email: string | null }): Promise<string | null> {
  const sealed = seal(c.refresh);
  const { error } = await db.from("gsc_connections").upsert({ brand_id: c.brandId, workspace_id: c.workspaceId, refresh_token: sealed, email: c.email, connected_by: c.userId, backfilled_at: null, sync_error: null });
  if (error) throw new Error(error.message + (/gsc_connections/.test(error.message) ? " Run supabase/068_google_tech.sql on the VPS database." : ""));
  const { data: brand } = await db.from("brands").select("domain").eq("id", c.brandId).maybeSingle();
  let site: string | null = null;
  try {
    site = matchProperty(await listSites(await accessToken(sealed)), String(brand?.domain ?? ""));
  } catch {
    // The person picks the property on the screen instead.
  }
  await db.from("brands").update({ gsc_email: c.email, gsc_site: site }).eq("id", c.brandId);
  if (site) await queueGscSync(c.workspaceId, c.brandId, true);
  return site;
}

export const queueGscSync = (ws: string, brandId: string, now = false) =>
  enqueue("gsc_sync", { brandId }, { workspaceId: ws, key: `gsc_sync:${brandId}:${now ? `now:${Date.now()}` : new Date().toISOString().slice(0, 10)}`, maxAttempts: 3 });

/** The daily tick: one sync a day for each brand with a connected property. */
export async function queueGscSyncs(db: SupabaseClient) {
  const { data, error } = await db.from("gsc_connections").select("brand_id, workspace_id");
  if (error) return; // before 068_google_tech.sql
  const day = new Date().toISOString().slice(0, 10);
  await enqueueMany((data ?? []).map((c) => ({ kind: "gsc_sync" as const, workspace_id: c.workspace_id, key: `gsc_sync:${c.brand_id}:${day}`, payload: { brandId: c.brand_id } })));
}

async function query(token: string, site: string, body: Record<string, unknown>): Promise<GscRow[]> {
  const out: GscRow[] = [];
  for (let start = 0; start < 100_000; start += 25_000) {
    const r = await api<{ rows?: GscRow[] }>(`${WM}/sites/${enc(site)}/searchAnalytics/query`, token, { ...body, rowLimit: 25_000, startRow: start }, LABEL);
    out.push(...(r.rows ?? []));
    if ((r.rows?.length ?? 0) < 25_000) break;
  }
  return out;
}

/** Inspect one URL now (also used by the screen's Inspect button). Saves and returns the answer. */
export async function inspectUrl(db: SupabaseClient, conn: Pick<Conn, "brand_id" | "workspace_id" | "refresh_token">, site: string, url: string): Promise<Inspection> {
  const token = await accessToken(conn.refresh_token);
  const raw = await api<Parameters<typeof readInspection>[1]>(INSPECT, token, { inspectionUrl: url, siteUrl: site, languageCode: "en-US" }, LABEL);
  const i = readInspection(url, raw);
  await db.from("gsc_inspections").upsert({
    brand_id: conn.brand_id,
    workspace_id: conn.workspace_id,
    url,
    inspected_at: new Date().toISOString(),
    indexed: isIndexed(i),
    verdict: i.verdict,
    coverage: i.coverage,
    robots: i.robots,
    google_canonical: i.googleCanonical,
    user_canonical: i.userCanonical,
    last_crawl: i.lastCrawl,
    crawled_as: i.crawledAs,
    mobile: i.mobile,
    rich: i.rich,
  });
  return i;
}

/**
 * One brand's daily sync: site totals by day (16 months on the first run, then the last 10 days), each page's last
 * 28 days and the 28 before, sitemaps, then URL Inspection until the day's budget or the job's time is used up.
 * Hands over to another job when inspections are left for today.
 */
export async function syncGsc(db: SupabaseClient, brandId: string, part = 0) {
  const until = Date.now() + JOB_MS;
  const { data: conn } = await db.from("gsc_connections").select("brand_id, workspace_id, refresh_token, backfilled_at, inspect_day, inspected_today").eq("brand_id", brandId).maybeSingle();
  const { data: brand } = await db.from("brands").select("gsc_site").eq("id", brandId).maybeSingle();
  if (!conn || !brand?.gsc_site) return;
  const c = conn as Conn;
  const site = String(brand.gsc_site);
  const ws = c.workspace_id;
  const now = new Date();
  try {
    const token = await accessToken(c.refresh_token);
    if (part === 0) {
      // Totals by day.
      const from = c.backfilled_at ? dayBefore(now, 10) : dayBefore(now, 486);
      const days = dayStats(await query(token, site, { startDate: from, endDate: dayBefore(now, 1), dimensions: ["date"] }));
      for (let i = 0; i < days.length; i += 500) await db.from("gsc_daily").upsert(days.slice(i, i + 500).map((d) => ({ brand_id: brandId, workspace_id: ws, day: d.day, clicks: Math.round(d.clicks), impressions: Math.round(d.impressions), position: d.position })));
      // Pages: the last 28 days against the 28 before. Data settles after about 2 days, so both windows end 2 days ago.
      const [cur, prev] = await Promise.all([
        query(token, site, { startDate: dayBefore(now, 30), endDate: dayBefore(now, 3), dimensions: ["page"] }),
        query(token, site, { startDate: dayBefore(now, 58), endDate: dayBefore(now, 31), dimensions: ["page"] }),
      ]);
      const prevBy = new Map(pageStats(prev).map((p) => [p.page, p]));
      const rows = pageStats(cur).map((p) => ({ brand_id: brandId, workspace_id: ws, page: p.page, clicks: Math.round(p.clicks), impressions: Math.round(p.impressions), position: p.position, clicks_prev: Math.round(prevBy.get(p.page)?.clicks ?? 0), impressions_prev: Math.round(prevBy.get(p.page)?.impressions ?? 0), updated_at: now.toISOString() }));
      for (const [page, p] of prevBy) if (!rows.some((r) => r.page === page)) rows.push({ brand_id: brandId, workspace_id: ws, page, clicks: 0, impressions: 0, position: 0, clicks_prev: Math.round(p.clicks), impressions_prev: Math.round(p.impressions), updated_at: now.toISOString() });
      for (let i = 0; i < rows.length; i += 500) await db.from("gsc_pages").upsert(rows.slice(i, i + 500));
      // Pages that dropped out of both windows are cleared.
      await db.from("gsc_pages").delete().eq("brand_id", brandId).lt("updated_at", new Date(now.getTime() - 3 * 864e5).toISOString());
      // Sitemaps.
      const sm = readSitemaps(await api(`${WM}/sites/${enc(site)}/sitemaps`, token, undefined, LABEL));
      await db.from("gsc_sitemaps").delete().eq("brand_id", brandId);
      if (sm.length) await db.from("gsc_sitemaps").insert(sm.map((s) => ({ brand_id: brandId, workspace_id: ws, path: s.path, last_downloaded: s.lastDownloaded, last_submitted: s.lastSubmitted, pending: s.pending, is_index: s.isIndex, errors: s.errors, warnings: s.warnings, submitted: s.submitted, indexed: s.indexed })));
      await db.from("gsc_connections").update({ backfilled_at: c.backfilled_at ?? now.toISOString(), synced_at: now.toISOString(), sync_error: null }).eq("brand_id", brandId);
    }

    // URL Inspection, within today's budget.
    const today = now.toISOString().slice(0, 10);
    const used = c.inspect_day === today ? c.inspected_today : 0;
    const budget = INSPECT_PER_DAY - used;
    if (budget <= 0) return;
    const candidates = await inspectionCandidates(db, brandId);
    const { data: last } = await db.from("gsc_inspections").select("url, inspected_at").eq("brand_id", brandId).limit(50_000);
    const pick = pickInspections(candidates, new Map((last ?? []).map((l) => [l.url as string, l.inspected_at as string])), budget, now);
    let done = 0;
    for (let i = 0; i < pick.length && Date.now() < until; i += 5) {
      // 5 at a time stays far under Google's 600 a minute.
      const batch = pick.slice(i, i + 5);
      const res = await Promise.allSettled(batch.map((u) => inspectUrl(db, c, site, u)));
      done += batch.length;
      const quota = res.find((r) => r.status === "rejected" && /quota|rate|429/i.test(String((r as PromiseRejectedResult).reason)));
      if (quota) break;
    }
    await db.from("gsc_connections").update({ inspect_day: today, inspected_today: used + done }).eq("brand_id", brandId);
    if (done < pick.length && Date.now() >= until) await enqueue("gsc_sync", { brandId, part: part + 1 }, { workspaceId: ws, key: `gsc_sync:${brandId}:${today}:${part + 1}`, maxAttempts: 2 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("gsc_connections").update({ sync_error: msg.slice(0, 300) }).eq("brand_id", brandId);
    // A revoked sign-in or a lost property won't fix itself by retrying.
    if (/invalid_grant|permission|403|401/i.test(msg)) return;
    throw e;
  }
}

/** Pages worth inspecting: Search Console pages with clicks, pages AI answers cite, and the latest crawl's pages. */
async function inspectionCandidates(db: SupabaseClient, brandId: string) {
  const { data: pages } = await db.from("gsc_pages").select("page, clicks").eq("brand_id", brandId).order("clicks", { ascending: false }).limit(5000);
  const { data: audit } = await db.from("site_audits").select("id").eq("brand_id", brandId).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const crawl: { url: string; in_sitemap: boolean }[] = [];
  if (audit) {
    for (let from = 0; from < 50_000; from += 1000) {
      const { data } = await db.from("crawl_pages").select("url, in_sitemap").eq("audit_id", audit.id).eq("indexable", true).order("url").range(from, from + 999);
      crawl.push(...((data ?? []) as { url: string; in_sitemap: boolean }[]));
      if (!data || data.length < 1000) break;
    }
  }
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: runs } = await db.from("runs").select("chats").eq("brand_id", brandId).gte("at", since).limit(200);
  const cited = new Set<string>();
  for (const r of (runs ?? []) as { chats?: { sources?: { url?: string }[] }[] }[]) for (const ch of r.chats ?? []) for (const s of ch.sources ?? []) if (s.url) cited.add(s.url.replace(/#.*$/, ""));
  return [
    ...(pages ?? []).map((p) => ({ url: p.page as string, clicks: Number(p.clicks) || 0, cited: cited.has(p.page as string), inSitemap: false })),
    ...crawl.map((p) => ({ url: p.url, clicks: 0, cited: cited.has(p.url), inSitemap: p.in_sitemap })),
  ];
}
