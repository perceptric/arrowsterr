import { entitlement, requireActive, requireTrack } from "@/lib/entitlements";
import { normUrl, readSettings } from "@/lib/audit/crawl";
import { startAudit } from "@/lib/audit/crawlServer";
import { adminClient, requireRole } from "@/lib/serverAuth";

// Audit (docs/audit-plan.md, docs/audit-features.md): a brand's crawls, pages and links.
//   Viewers: "overview" (the latest crawl, the running one, history, settings), "status" (a crawl's progress),
//            "pages" (one page of the crawled pages, filtered and sorted) and "page" (one page with its links).
//   Editors: "start" (Crawl now) and "settings" (crawl settings and the weekly crawl).

const READ = ["overview", "status", "pages", "page"];
const PAGE_SIZE = 100;
const AUDIT_COLS = "id, brand_id, root, settings, status, stage, partial_reason, error, started_at, finished_at, heartbeat_at, pages_found, pages_done, over_limit, stats, previous_id, trigger, created_at";
const PAGE_COLS = "url_hash, url, final_url, status, error, content_type, title, depth, links_in, body_links_in, links_out, link_score, orphan, bad_links_out, ai_citations, value, indexable, words, in_sitemap, found_from, canonical, meta_robots";
/** Columns the Pages sheet may sort by. */
const SORTS = ["value", "url", "status", "depth", "links_in", "links_out", "link_score", "bad_links_out", "ai_citations", "words", "title"];

/** The quick views in Pages and Internal links (docs/audit-features.md, A7 and L3). */
type View = "all" | "ok" | "orphans" | "deep" | "unreachable" | "one_link" | "bad_links" | "redirects" | "broken" | "not_indexable" | "cited";
const VIEWS: View[] = ["all", "ok", "orphans", "deep", "unreachable", "one_link", "bad_links", "redirects", "broken", "not_indexable", "cited"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, READ.includes(body.action) ? "viewer" : "editor");
  if ("denied" in auth) return auth.denied;
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const ws = String(body.workspaceId);
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const track = await requireTrack(ws, "seo");
  if (track) return track;

  const brandOf = async (id: unknown) => {
    const { data } = await db.from("brands").select("id, url, domain, audit_settings, audit_weekly").eq("id", String(id ?? "")).eq("workspace_id", ws).maybeSingle();
    return data;
  };
  const auditOf = async (id: unknown) => {
    const { data } = await db.from("audits").select(AUDIT_COLS).eq("id", String(id ?? "")).eq("workspace_id", ws).maybeSingle();
    return data;
  };

  try {
    switch (body.action) {
      case "overview": {
        const brand = await brandOf(body.brandId);
        if (!brand) return fail("Brand not found.", 404);
        const { data: audits, error } = await db.from("audits").select(AUDIT_COLS).eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(12);
        if (error) return fail(/audits/.test(error.message) ? "Audit needs supabase/085_audits.sql." : error.message, 500);
        const e = await entitlement(ws);
        const list = audits ?? [];
        const running = list.find((a) => a.status === "queued" || a.status === "running") ?? null;
        const latest = list.find((a) => a.status === "done" || a.status === "partial" || a.status === "failed") ?? null;
        const fallback = normUrl(String(brand.url || `https://${brand.domain}/`)) ?? `https://${brand.domain}/`;
        return Response.json({
          running,
          latest,
          history: list.filter((a) => a.status === "done" || a.status === "partial").slice(0, 8).reverse().map((a) => ({ id: a.id, status: a.status, finished_at: a.finished_at, pages: a.pages_done, stats: a.stats })),
          settings: readSettings(brand.audit_settings as Record<string, unknown>, fallback, e.limits.auditPages),
          weekly: brand.audit_weekly !== false,
          limits: { pages: e.limits.auditPages, everyDays: e.limits.auditEveryDays },
          canCrawl: !e.readOnly,
        });
      }
      case "status": {
        const audit = await auditOf(body.auditId);
        if (!audit) return fail("Crawl not found.", 404);
        return Response.json({ audit });
      }
      case "pages": {
        const audit = await auditOf(body.auditId);
        if (!audit) return fail("Crawl not found.", 404);
        const view: View = VIEWS.includes(body.view) ? body.view : "all";
        const sort = SORTS.includes(body.sort) ? body.sort : "value";
        const desc = body.desc !== false;
        const offset = Math.max(0, Math.round(Number(body.offset) || 0));
        let q = db.from("audit_pages").select(PAGE_COLS, { count: "exact" }).eq("audit_id", audit.id);
        if (view === "ok") q = q.gte("status", 200).lt("status", 300);
        if (view === "orphans") q = q.eq("orphan", true);
        if (view === "deep") q = q.gte("depth", 4).gte("status", 200).lt("status", 300);
        if (view === "unreachable") q = q.is("depth", null).gte("status", 200).lt("status", 300);
        if (view === "one_link") q = q.eq("links_in", 1).gte("status", 200).lt("status", 300);
        if (view === "bad_links") q = q.gt("bad_links_out", 0);
        if (view === "redirects") q = q.gte("status", 300).lt("status", 400);
        if (view === "broken") q = q.or("status.eq.0,status.gte.400");
        if (view === "not_indexable") q = q.eq("indexable", false).gte("status", 200).lt("status", 300);
        if (view === "cited") q = q.gt("ai_citations", 0);
        const search = String(body.q ?? "").trim().slice(0, 100).replace(/[%,()*]/g, " ");
        if (search) q = q.or(`url.ilike.*${search}*,title.ilike.*${search}*`);
        const { data, count, error } = await q.order(sort, { ascending: !desc, nullsFirst: false }).order("url_hash").range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        return Response.json({ pages: data ?? [], total: count ?? 0, offset, pageSize: PAGE_SIZE });
      }
      case "page": {
        const audit = await auditOf(body.auditId);
        if (!audit) return fail("Crawl not found.", 404);
        const hash = String(body.hash ?? "");
        const { data: page } = await db.from("audit_pages").select(`${PAGE_COLS}, h1, h2, redirect_chain, published_at, modified_at, sitemap_lastmod, ext_links, ms`).eq("audit_id", audit.id).eq("url_hash", hash).maybeSingle();
        if (!page) return fail("Page not found in this crawl.", 404);
        const [{ data: inRows }, { data: outRows }] = await Promise.all([
          db.from("audit_links").select("from_hash, anchor, rel, place").eq("audit_id", audit.id).eq("to_hash", hash).limit(500),
          db.from("audit_links").select("to_hash, to_url, anchor, rel, place").eq("audit_id", audit.id).eq("from_hash", hash).limit(500),
        ]);
        // The pages on each end, for their address, title and status.
        const hashes = [...new Set([...(inRows ?? []).map((l) => l.from_hash as string), ...(outRows ?? []).map((l) => l.to_hash as string)])];
        const known = new Map<string, { url: string; title: string | null; status: number }>();
        for (let i = 0; i < hashes.length; i += 200) {
          const { data } = await db.from("audit_pages").select("url_hash, url, title, status").eq("audit_id", audit.id).in("url_hash", hashes.slice(i, i + 200));
          for (const p of data ?? []) known.set(p.url_hash as string, { url: p.url as string, title: (p.title as string | null) ?? null, status: p.status as number });
        }
        const linksIn = (inRows ?? []).map((l) => ({ ...l, ...(known.get(l.from_hash as string) ?? { url: "", title: null, status: 0 }) })).filter((l) => l.url);
        const linksOut = (outRows ?? []).map((l) => {
          const k = known.get(l.to_hash as string);
          return { ...l, url: l.to_url, title: k?.title ?? null, status: k ? k.status : null };
        });
        return Response.json({ page, linksIn, linksOut });
      }
      case "start": {
        const brand = await brandOf(body.brandId);
        if (!brand) return fail("Brand not found.", 404);
        const inactive = await requireActive(ws);
        if (inactive) return inactive;
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const { data: user } = await auth.sb.auth.getUser(token);
        const started = await startAudit(db, { workspaceId: ws, brandId: brand.id as string, trigger: "manual", userId: user?.user?.id ?? null });
        return Response.json(started);
      }
      case "settings": {
        const brand = await brandOf(body.brandId);
        if (!brand) return fail("Brand not found.", 404);
        const e = await entitlement(ws);
        const fallback = normUrl(String(brand.url || `https://${brand.domain}/`)) ?? `https://${brand.domain}/`;
        const settings = readSettings(body.settings && typeof body.settings === "object" ? body.settings : (brand.audit_settings as Record<string, unknown>), fallback, e.limits.auditPages);
        // The start address has to be on the brand's own site.
        const site = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, "");
        if (site(settings.start) !== site(fallback) && !site(settings.start).endsWith(`.${site(fallback)}`)) return fail(`The start address has to be on ${site(fallback)}.`);
        const patch: Record<string, unknown> = { audit_settings: settings };
        if (typeof body.weekly === "boolean") patch.audit_weekly = body.weekly;
        const { error } = await db.from("brands").update(patch).eq("id", brand.id);
        if (error) throw new Error(error.message);
        return Response.json({ settings, weekly: typeof body.weekly === "boolean" ? body.weekly : brand.audit_weekly !== false });
      }
      default:
        return fail("Unknown action.");
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
