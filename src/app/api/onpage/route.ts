import { requireTrack, take } from "@/lib/entitlements";
import { FixError, startFix } from "@/lib/fixServer";
import type { OnpageResult } from "@/lib/onpage";
import { startOnpage, topPages } from "@/lib/onpageServer";
import { TASK_COST } from "@/lib/plans";
import { adminClient, requireRole } from "@/lib/serverAuth";

export const maxDuration = 120;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status });
const SETUP = "Run supabase/062_onpage.sql with psql on the VPS database to turn on the On-page Audit.";

/** A full https address from what someone typed, or "" when it isn't one. */
function cleanUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/\.[a-z]{2,}$/i.test(u.hostname)) return "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

// On-page Audit (docs/onpage-audit.md). Reading audits needs no route: the page asks Supabase, and viewers may read.
//   start: { brandId, url, keyword }        editors, Organic Research plans: 25 tasks, handed back if it fails
//   pages: { brandId }                      editors: the brand's pages that bring the most visits, with their main keyword
//   fix:   { brandId, auditId, play }       editors: prepare a change set for this page in the brand's CMS
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "editor");
  if ("denied" in auth) return auth.denied;
  const ws = String(body.workspaceId);
  const db = adminClient();
  if (!db) return err("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const { data: me } = await auth.sb.auth.getUser();
  const userId = me.user?.id ?? "";
  const { data: brand } = await db.from("brands").select("id, name, domain, profile").eq("id", str(body.brandId, 60)).eq("workspace_id", ws).maybeSingle();
  if (!brand) return err("Brand not found.", 404);
  const country = (brand.profile as { country?: string } | null)?.country;

  if (body.action === "start") {
    const locked = await requireTrack(ws, "seo");
    if (locked) return locked;
    const url = cleanUrl(str(body.url, 2000));
    const keyword = str(body.keyword, 120).replace(/\s+/g, " ").toLowerCase();
    if (!url) return err("Enter the page's address, like https://example.com/page.");
    if (keyword.length < 2) return err("Enter the keyword the page should rank for.");
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: running, error } = await db.from("onpage_audits").select("id").eq("brand_id", brand.id).eq("url", url).eq("keyword", keyword).eq("status", "running").gte("created_at", since).limit(1);
    if (error) return err(/onpage_audits/.test(error.message) ? SETUP : error.message, 500);
    if (running?.length) return Response.json({ auditId: running[0].id });
    const took = await take(ws, "tasks", TASK_COST.onpage, { refundIfFree: false });
    if (!took.ok) return took.response;
    try {
      const fromPack = took.fromPack ?? 0;
      const auditId = await startOnpage(db, ws, userId, brand.id, url, keyword, took.period ? { period: took.period, plan: TASK_COST.onpage - fromPack, pack: fromPack } : null);
      return Response.json({ auditId });
    } catch (e) {
      await took.giveBack();
      return err(e instanceof Error ? e.message : String(e), 500);
    }
  }

  if (body.action === "pages") {
    const locked = await requireTrack(ws, "seo");
    if (locked) return locked;
    const took = await take(ws, "tasks", TASK_COST.domain, { refundIfFree: false });
    if (!took.ok) return took.response;
    try {
      const { pages } = await topPages(String(brand.domain), country);
      return Response.json({ pages });
    } catch (e) {
      await took.giveBack();
      return err(e instanceof Error ? e.message : String(e), 502);
    }
  }

  if (body.action === "fix") {
    const { data: audit } = await db.from("onpage_audits").select("id, status, result").eq("id", str(body.auditId, 60)).eq("brand_id", brand.id).maybeSingle();
    if (!audit || audit.status !== "done" || !audit.result) return err("Audit not found.", 404);
    const r = audit.result as OnpageResult;
    const play = str(body.play, 20);
    const check = r.checks.find((c) => c.fix === play && (c.status === "fail" || c.status === "warn"));
    if (!check || !check.fix) return err("Nothing to fix for that.");
    try {
      const set = await startFix(db, ws, userId, brand, check.fix, [r.url]);
      return Response.json({ setId: set.id, title: set.title });
    } catch (e) {
      if (e instanceof FixError) return err(e.message, e.status, e.connect ? { connect: true } : {});
      return err(e instanceof Error ? e.message : String(e), 500);
    }
  }

  return err("Unknown action.");
}
