import { cruxKey } from "@/lib/cwv";
import { requireTrack } from "@/lib/entitlements";
import { speed } from "@/lib/freeRunners";
import { accessToken, googleReady } from "@/lib/google";
import { INSPECT_PER_DAY, inspectUrl, listSites, queueGscSync } from "@/lib/gsc";
import { enqueue } from "@/lib/jobs";
import { adminClient, isEditor, requireRole } from "@/lib/serverAuth";
import { aiAccess, llmsDraft, publishLlms, rivals, setIndexNow, shotOf } from "@/lib/aiAccess";
import { inspectLink } from "@/lib/tech/google";
import { byUrl } from "@/lib/tech/checks";
import { anchorFor, folders, suggestLinks, weakPages, type StructPage } from "@/lib/tech/structure";
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
//   structure:  { brandId }              the latest crawl by folder and depth, weak pages, orphans, redirects
//   suggest:    { brandId, url }         pages that should link to this one, with the anchor to use
//   ai:         { brandId }              AI crawler access, JavaScript dependence, pages AI cites, llms.txt, IndexNow
//   shot:       { brandId, url }         the phone screenshot of one page in the latest crawl
//   rivals:     { brandId, fresh? }      how the competitor pages AI cites are built, next to yours (cached a day)
//   llms:       { brandId }              an llms.txt drafted from the latest crawl
//   llmsPublish:{ brandId, text }        editors: save llms.txt on the brand's WordPress site through the plugin
//   indexnow:   { brandId, on }          editors: turn IndexNow on or off through the plugin
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

  /** The latest finished crawl of the brand. */
  async function latestCrawl() {
    const { data } = await db!.from("site_audits").select("id, created_at, pages, result").eq("brand_id", brand!.id).eq("status", "done").order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data;
  }

  if (body.action === "structure") {
    const a = await latestCrawl();
    if (!a || (a.result as { version?: number })?.version !== 2) return Response.json({ crawl: null });
    type Row = { url: string; depth: number | null; links_in: number; internal_rank: number | null; status: number; indexable: boolean; in_sitemap: boolean; title: string | null; template: string | null };
    const rows: Row[] = [];
    for (let from = 0; from < 50_000; from += 1000) {
      const { data } = await db.from("crawl_pages").select("url, depth, links_in, internal_rank, status, indexable, in_sitemap, title, template").eq("audit_id", a.id).order("url").range(from, from + 999);
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < 1000) break;
    }
    const { data: g } = await db.from("gsc_pages").select("page, clicks").eq("brand_id", brand.id).gt("clicks", 0).limit(50_000);
    const clicks: Record<string, number> = Object.fromEntries((g ?? []).map((x) => [x.page as string, Number(x.clicks) || 0]));
    const pages: StructPage[] = rows.map((r) => ({ url: r.url, depth: r.depth, linksIn: r.links_in, rank: r.internal_rank, status: r.status, indexable: r.indexable, clicks: byUrl(clicks, r.url) ?? 0 }));
    const { data: chains } = await db.from("crawl_pages").select("url, status, facts->chain").eq("audit_id", a.id).gte("status", 300).lt("status", 400).limit(2000);
    const depth = Array.from({ length: 7 }, () => ({ pages: 0, valuable: 0 }));
    for (const p of pages) if (p.depth !== null && p.indexable) {
      depth[Math.min(6, p.depth)].pages++;
      if (p.clicks > 0) depth[Math.min(6, p.depth)].valuable++;
    }
    const titleOf = new Map(rows.map((r) => [r.url, r.title ?? ""]));
    const result = a.result as { root?: string; redirectLinks?: { from: string; to: string }[] };
    return Response.json({
      crawl: { id: a.id, at: a.created_at, pages: a.pages, root: result.root ?? null, gsc: Boolean(g?.length) },
      folders: folders(pages).slice(0, 40),
      depth,
      weak: weakPages(pages, 40).map((p) => ({ ...p, title: titleOf.get(p.url) ?? "" })),
      orphans: rows.filter((r) => r.in_sitemap && r.links_in === 0 && r.indexable).slice(0, 200).map((r) => ({ url: r.url, title: r.title, clicks: byUrl(clicks, r.url) ?? 0 })),
      lowRank: [...pages].filter((p) => p.indexable && p.rank !== null).sort((x, y) => (x.rank ?? 0) - (y.rank ?? 0)).slice(0, 30).map((p) => ({ ...p, title: titleOf.get(p.url) ?? "" })),
      topRank: [...pages].filter((p) => p.rank !== null).sort((x, y) => (y.rank ?? 0) - (x.rank ?? 0)).slice(0, 12).map((p) => ({ url: p.url, rank: p.rank, linksIn: p.linksIn })),
      chains: ((chains ?? []) as unknown as { url: string; chain?: { url: string; status: number }[] }[]).filter((c) => (c.chain?.length ?? 0) >= 3).slice(0, 100).map((c) => ({ url: c.url, chain: c.chain })),
      redirectLinks: (result.redirectLinks ?? []).slice(0, 100),
      sample: rows.filter((r) => r.status >= 200 && r.status < 400).slice(0, 1500).map((r) => ({ url: r.url, depth: r.depth, rank: r.internal_rank, indexable: r.indexable })),
    });
  }

  if (body.action === "suggest") {
    const a = await latestCrawl();
    const url = str(body.url, 2000);
    if (!a) return err("Crawl the site first.");
    type Row = { url: string; title: string | null; h1?: string[] | null; internal_rank: number | null };
    const rows: Row[] = [];
    for (let from = 0; from < 50_000; from += 1000) {
      const { data } = await db.from("crawl_pages").select("url, title, internal_rank, facts->page->h1").eq("audit_id", a.id).eq("indexable", true).order("url").range(from, from + 999);
      rows.push(...((data ?? []) as unknown as Row[]));
      if (!data || data.length < 1000) break;
    }
    const target = rows.find((r) => r.url === url);
    if (!target) return err("That page isn't in the latest crawl.");
    const t = { url, title: target.title ?? "", h1: target.h1?.[0] ?? "" };
    // Topic matches first, then drop the pages that already link here.
    const first = suggestLinks(t, rows.map((r) => ({ url: r.url, title: r.title ?? "", h1: r.h1?.[0] ?? "", rank: r.internal_rank, links: [] })), 20);
    const { data: linking } = first.length ? await db.from("crawl_pages").select("url").eq("audit_id", a.id).in("url", first.map((f) => f.from)).contains("facts", { links: [{ u: url }] }) : { data: [] };
    const already = new Set((linking ?? []).map((l) => l.url as string));
    return Response.json({ anchor: anchorFor(t), suggestions: first.filter((f) => !already.has(f.from)).slice(0, 5) });
  }

  if (body.action === "ai" || body.action === "shot" || body.action === "rivals" || body.action === "llms" || body.action === "llmsPublish" || body.action === "indexnow") {
    const { data: full } = await db.from("brands").select("id, name, domain").eq("id", brand.id).maybeSingle();
    const b = { id: brand.id, name: (full?.name as string) || brand.domain, domain: brand.domain };
    try {
      if (body.action === "ai") return Response.json({ ...(await aiAccess(db, b)), canEdit: editor });
      if (body.action === "shot") return Response.json({ shot: await shotOf(db, b.id, str(body.url, 2000)) });
      if (body.action === "rivals") return Response.json(await rivals(db, b, Boolean(body.fresh) && editor));
      if (body.action === "llms") return Response.json({ text: await llmsDraft(db, b) });
      const denied = await needEditor();
      if (denied) return denied;
      if (body.action === "llmsPublish") return Response.json(await publishLlms(db, b.id, String(body.text ?? "").slice(0, 200_000)));
      return Response.json(await setIndexNow(db, b.id, Boolean(body.on)));
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  return err("Unknown action.");
}
