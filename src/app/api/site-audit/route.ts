import { startAudit } from "@/lib/audit";
import type { AuditResult } from "@/lib/audit";
import { requireTrack } from "@/lib/entitlements";
import { FixError, startFix } from "@/lib/fixServer";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { fixPlayOf, isStuck } from "@/lib/siteAudit";

export const maxDuration = 60;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status });
const SETUP = "Run supabase/061_site_audits.sql with psql on the VPS database to turn on the Site Audit screen.";

// Site Audit (docs/site-audit.md). Reading crawls needs no route: the page asks Supabase, and viewers may read.
//   start:  { brandId }                     editors, Organic Research plans: crawl the brand's site now
//   weekly: { brandId, on }                 editors: turn the weekly crawl on or off
//   fix:    { brandId, auditId, issueId }   editors: prepare a change set in the brand's CMS for that issue's pages
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const { data: me } = await auth.sb.auth.getUser();
  const userId = me.user?.id ?? "";
  const { data: brand } = await db.from("brands").select("id, name, domain").eq("id", str(body.brandId, 60)).eq("workspace_id", ws).maybeSingle();
  if (!brand) return err("Brand not found.", 404);

  if (body.action === "start") {
    const locked = await requireTrack(ws, "seo");
    if (locked) return locked;
    const { data: last, error } = await db.from("site_audits").select("id, status, created_at").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return err(/brand_id/.test(error.message) ? SETUP : error.message, 500);
    if (last && last.status === "running" && !isStuck(last, Date.now())) return err("A crawl is already running for this site.", 409);
    if (last && isStuck(last, Date.now())) await db.from("site_audits").update({ status: "failed", error: "The crawl stopped responding.", finished_at: new Date().toISOString() }).eq("id", last.id);
    try {
      return Response.json({ audit: await startAudit(db, ws, userId, String(brand.domain), brand.id) });
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  if (body.action === "weekly") {
    const { error } = await db.from("brands").update({ audit_weekly: Boolean(body.on) }).eq("id", brand.id);
    if (error) return err(/audit_weekly/.test(error.message) ? SETUP : error.message, 500);
    return Response.json({ ok: true });
  }

  if (body.action === "fix") {
    const { data: audit } = await db.from("site_audits").select("id, status, result").eq("id", str(body.auditId, 60)).eq("brand_id", brand.id).maybeSingle();
    if (!audit || audit.status !== "done") return err("Crawl not found.", 404);
    const issue = ((audit.result as AuditResult).issues ?? []).find((i) => i.id === str(body.issueId, 60));
    const play = issue && fixPlayOf(issue);
    if (!issue || !play) return err("This issue can't be fixed from here.");
    try {
      const set = await startFix(db, ws, userId, brand, play, issue.pages);
      return Response.json({ setId: set.id, title: set.title });
    } catch (e) {
      if (e instanceof FixError) return err(e.message, e.status, e.connect ? { connect: true } : {});
      return err(e instanceof Error ? e.message : String(e), 500);
    }
  }

  return err("Unknown action.");
}
