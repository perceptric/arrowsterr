import { cruxKey } from "@/lib/cwv";
import { requireTrack } from "@/lib/entitlements";
import { speed } from "@/lib/freeRunners";
import { accessToken, googleReady } from "@/lib/google";
import { INSPECT_PER_DAY, inspectUrl, listSites, queueGscSync } from "@/lib/gsc";
import { enqueue } from "@/lib/jobs";
import { adminClient, isEditor, requireRole } from "@/lib/serverAuth";
import { inspectLink } from "@/lib/tech/google";
import { templateName } from "@/lib/tech/url";

export const maxDuration = 90;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400) => Response.json({ error }, { status });
const SETUP = "Run supabase/068_google_tech.sql on the VPS database.";

// Technical SEO, Indexing and Speed (docs/technical-seo-plan.md, phase 2). Viewers read; editors connect and run.
//   status:     { brandId }              connection, property, last sync, today's inspections, whether CrUX is set up
//   sites:      { brandId }              editors: the Search Console properties the connected account can read
//   pick:       { brandId, site }        editors: use this property, and sync now
//   disconnect: { brandId }              editors: remove the sign-in and the data it brought
//   sync:       { brandId }              editors: sync Search Console and Core Web Vitals now
//   indexing:   { brandId }              clicks by day, pages, inspections, sitemaps and the latest crawl's templates
//   inspect:    { brandId, url }         editors: inspect one URL now (counts toward today's 1,500)
//   speed:      { brandId }              Core Web Vitals for the site and its pages, with templates
//   lab:        { brandId, url, device } editors: a PageSpeed Insights lab test of one of the brand's pages
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "viewer");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const { data: brand } = await db.from("brands").select("id, domain, gsc_site, gsc_email").eq("id", str(body.brandId, 60)).eq("workspace_id", ws).maybeSingle();
  if (!brand) return err("Brand not found.", 404);
  const editor = await isEditor(auth.sb, ws);
  const needEditor = async () => {
    if (!editor) return err("Ask an editor to do this.", 403);
    return requireTrack(ws, "seo");
  };
  const { data: conn, error: connErr } = await db.from("gsc_connections").select("brand_id, workspace_id, refresh_token, email, synced_at, sync_error, backfilled_at, inspect_day, inspected_today").eq("brand_id", brand.id).maybeSingle();
  if (connErr && /gsc_connections/.test(connErr.message)) return err(SETUP, 500);
  const today = new Date().toISOString().slice(0, 10);

  if (body.action === "status") {
    return Response.json({
      googleReady: googleReady(),
      cruxReady: Boolean(cruxKey()),
      connected: Boolean(conn),
      email: conn?.email ?? brand.gsc_email ?? null,
      site: brand.gsc_site ?? null,
      syncedAt: conn?.synced_at ?? null,
      syncError: conn?.sync_error ?? null,
      backfilled: Boolean(conn?.backfilled_at),
      inspectedToday: conn?.inspect_day === today ? conn.inspected_today : 0,
      inspectPerDay: INSPECT_PER_DAY,
      canEdit: editor,
    });
  }

  if (body.action === "sites") {
    const stop = await needEditor();
    if (stop) return stop;
    if (!conn) return err("Connect Search Console first.");
    try {
      return Response.json({ sites: await listSites(await accessToken(conn.refresh_token)) });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  if (body.action === "pick") {
    const stop = await needEditor();
    if (stop) return stop;
    if (!conn) return err("Connect Search Console first.");
    const site = str(body.site, 300);
    if (!/^(sc-domain:|https?:\/\/)/.test(site)) return err("Pick a property.");
    await db.from("brands").update({ gsc_site: site }).eq("id", brand.id);
    await db.from("gsc_connections").update({ backfilled_at: null }).eq("brand_id", brand.id);
    await queueGscSync(ws, brand.id, true);
    return Response.json({ site });
  }

  if (body.action === "disconnect") {
    const stop = await needEditor();
    if (stop) return stop;
    for (const t of ["gsc_daily", "gsc_pages", "gsc_inspections", "gsc_sitemaps", "gsc_connections"]) await db.from(t).delete().eq("brand_id", brand.id);
    await db.from("brands").update({ gsc_site: null, gsc_email: null }).eq("id", brand.id);
    return Response.json({ ok: true });
  }

  if (body.action === "sync") {
    const stop = await needEditor();
    if (stop) return stop;
    if (conn && brand.gsc_site) await queueGscSync(ws, brand.id, true);
    if (cruxKey()) await enqueue("cwv_sync", { brandId: brand.id }, { workspaceId: ws, key: `cwv_sync:${brand.id}:now:${Date.now()}`, maxAttempts: 2 });
    return Response.json({ ok: true });
  }

  /** The latest crawl's template for each page, and the templates' names. */
  async function templates() {
    const { data: a } = await db!.from("site_audits").select("id, result").eq("brand_id", brand!.id).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const map: Record<string, string> = {};
    if (a) {
      for (let from = 0; from < 50_000; from += 1000) {
        const { data } = await db!.from("crawl_pages").select("url, template").eq("audit_id", a.id).order("url").range(from, from + 999);
        for (const r of data ?? []) if (r.template) map[r.url as string] = r.template as string;
        if (!data || data.length < 1000) break;
      }
    }
    const names = Object.fromEntries([...new Set(Object.values(map))].map((t) => [t, templateName(t)]));
    return { map, names };
  }

  if (body.action === "indexing") {
    if (!conn || !brand.gsc_site) return Response.json({ connected: Boolean(conn), site: brand.gsc_site ?? null });
    const [daily, pages, losing, insp, sitemaps, tpl] = await Promise.all([
      db.from("gsc_daily").select("day, clicks, impressions, position").eq("brand_id", brand.id).order("day").limit(500),
      db.from("gsc_pages").select("page, clicks, impressions, position, clicks_prev, impressions_prev").eq("brand_id", brand.id).order("clicks", { ascending: false }).limit(2000),
      db.from("gsc_pages").select("page, clicks, impressions, position, clicks_prev, impressions_prev").eq("brand_id", brand.id).order("clicks_prev", { ascending: false }).limit(300),
      db.from("gsc_inspections").select("url, inspected_at, indexed, verdict, coverage, robots, google_canonical, user_canonical, last_crawl, crawled_as, mobile, rich").eq("brand_id", brand.id).order("inspected_at", { ascending: false }).limit(5000),
      db.from("gsc_sitemaps").select("path, last_downloaded, last_submitted, pending, is_index, errors, warnings, submitted, indexed").eq("brand_id", brand.id),
      templates(),
    ]);
    const all = new Map([...(pages.data ?? []), ...(losing.data ?? [])].map((p) => [p.page as string, p]));
    return Response.json({
      connected: true,
      site: brand.gsc_site,
      daily: daily.data ?? [],
      pages: [...all.values()],
      inspections: insp.data ?? [],
      sitemaps: sitemaps.data ?? [],
      templates: tpl,
      inspectBase: inspectLink(String(brand.gsc_site), ""),
    });
  }

  if (body.action === "inspect") {
    const stop = await needEditor();
    if (stop) return stop;
    if (!conn || !brand.gsc_site) return err("Connect Search Console first.");
    const used = conn.inspect_day === today ? conn.inspected_today : 0;
    if (used >= 1950) return err("Google's limit of 2,000 inspections a day for this property is nearly used. Try again tomorrow.", 429);
    try {
      const i = await inspectUrl(db, conn, String(brand.gsc_site), str(body.url, 2000));
      await db.from("gsc_connections").update({ inspect_day: today, inspected_today: used + 1 }).eq("brand_id", brand.id);
      return Response.json({ inspection: i });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  if (body.action === "speed") {
    const [origin, urls, tpl] = await Promise.all([
      db.from("cwv_origin").select("form_factor, fetched_at, vitals, history").eq("brand_id", brand.id),
      db.from("cwv_urls").select("url, form_factor, fetched_at, vitals, source, lab").eq("brand_id", brand.id).limit(2000),
      templates(),
    ]);
    if (origin.error && /cwv_origin/.test(origin.error.message)) return err(SETUP, 500);
    return Response.json({ cruxReady: Boolean(cruxKey()), origin: origin.data ?? [], urls: urls.data ?? [], templates: tpl });
  }

  if (body.action === "lab") {
    const stop = await needEditor();
    if (stop) return stop;
    const url = str(body.url, 2000);
    const host = (u: string) => {
      try {
        return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    };
    if (!host(url) || host(url) !== host(String(brand.domain))) return err("Test a page on this brand's own site.");
    try {
      const r = await speed(/^https?:\/\//.test(url) ? url : `https://${url}`, body.device === "desktop" ? "desktop" : "mobile");
      await db.from("cwv_urls").upsert({ brand_id: brand.id, workspace_id: ws, url: r.result.url, form_factor: body.device === "desktop" ? "desktop-lab" : "phone-lab", fetched_at: new Date().toISOString(), vitals: {}, source: "lab", lab: r.result });
      return Response.json({ lab: r.result });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  return err("Unknown action.");
}
