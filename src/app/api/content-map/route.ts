import { startMap } from "@/lib/contentMapServer";
import { addCalendarItems } from "@/lib/db";
import { requireTrack, take } from "@/lib/entitlements";
import { FixError, startFix } from "@/lib/fixServer";
import { TASK_COST } from "@/lib/plans";
import { adminClient, requireRole } from "@/lib/serverAuth";

export const maxDuration = 60;

const str = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const err = (error: string, status = 400, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status });

// Content Map (docs/content-map.md). Reading maps needs no route: the page asks Supabase, and viewers may read.
//   start: { brandId }                       editors, Organic Research plans: 40 tasks, handed back if the build fails
//   plan:  { brandId, keyword, volume?, pillar? }   editors: add a missing topic to the Content Plan
//   links: { brandId, hub }                  editors: prepare internal links on a pillar's main page in the brand's CMS
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
    const since = new Date(Date.now() - 20 * 60_000).toISOString();
    const { data: running } = await db.from("content_maps").select("id").eq("brand_id", brand.id).eq("status", "running").gte("created_at", since).limit(1);
    if (running?.length) return Response.json({ mapId: running[0].id });
    const took = await take(ws, "tasks", TASK_COST.contentmap, { refundIfFree: false });
    if (!took.ok) return took.response;
    try {
      const pack = took.fromPack ?? 0;
      const mapId = await startMap(db, ws, userId, brand.id, took.period ? { period: took.period, plan: TASK_COST.contentmap - pack, pack } : null);
      return Response.json({ mapId });
    } catch (e) {
      await took.giveBack();
      return err(e instanceof Error ? e.message : String(e), 500);
    }
  }

  if (body.action === "plan") {
    const keyword = str(body.keyword, 200).toLowerCase();
    if (!keyword) return err("Pick a topic.");
    const { data: site } = await db.from("sites").select("id").eq("brand_id", brand.id).eq("workspace_id", ws).maybeSingle();
    if (!site) return err("Open the Editorial Calendar once to set up the Content Plan, then add this again.");
    const volume = Number(body.volume);
    const added = await addCalendarItems(db, ws, [
      { site_id: site.id, keyword, secondary: [], stage: null, theme: str(body.pillar, 60) || null, volume: Number.isFinite(volume) ? Math.round(volume) : null, difficulty: null, intent: null, cpc: null, source: "content_map" },
    ]);
    return Response.json({ added });
  }

  if (body.action === "links") {
    const hub = str(body.hub, 1000);
    if (!/^https?:\/\//.test(hub)) return err("This pillar has no main page yet.");
    try {
      const set = await startFix(db, ws, userId, brand, "links", [hub]);
      return Response.json({ setId: set.id });
    } catch (e) {
      if (e instanceof FixError) return err(e.message, e.status, e.connect ? { connect: true } : {});
      return err(e instanceof Error ? e.message : String(e), 500);
    }
  }

  return err("Unknown action.");
}
