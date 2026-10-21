import { dfsReady } from "@/lib/dataforseo";
import { requireActive, requireWriter, take } from "@/lib/entitlements";
import { fillColumnCell, makeImage, rewritePart } from "@/lib/gridServer";
import { queueReady } from "@/lib/jobs";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";
import { adminClient, requireRole } from "@/lib/serverAuth";
import type { BriefRow } from "@/lib/writerBrief";
import { draftFromBrief, startBrief } from "@/lib/writerServer";

// The Library grid's actions (docs/content-grid.md, supabase/054_content_grid.sql).
//   { action: "generate", itemIds }                         make the whole article for each row: the brief, then
//                                                           the draft. A row with a ready brief goes to its draft;
//                                                           a row being written is left alone.
//   { action: "cell", itemId, part, h2, index, note, current }  write one cell again; returns its nodes
//   { action: "image", itemId, docId, prompt }              an AI image for the article; returns { src, alt }
//   { action: "column", columnId, itemId, prompt }          one cell of an AI column, prompt already filled in
const ACTIONS = ["generate", "cell", "image", "column"];
const fail = (error: string, status: number) => Response.json({ error }, { status });
const NOT_RUN = (m: string) => (/writer_|auto_draft/.test(m) ? "Run supabase/054_content_grid.sql in Supabase." : m);

async function handle(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ws = body.workspaceId as string;
  const auth = await requireRole(request, ws, "editor");
  if ("denied" in auth) return auth.denied;
  const action = String(body.action ?? "");
  if (!ACTIONS.includes(action)) return fail("Unknown action.", 400);
  const db = adminClient();
  if (!db) return fail("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const blocked = (await requireWriter(ws)) ?? (await requireActive(ws));
  if (blocked) return blocked;
  const { data: me } = await auth.sb.auth.getUser();
  const userId = me.user?.id ?? null;

  // Read as the caller, so another workspace's rows are not found.
  type Item = { id: string; site_id: string; keyword: string };
  const item = async (id: unknown) => {
    const { data } = await auth.sb.from("calendar_items").select("id, site_id, keyword").eq("id", String(id ?? "")).eq("workspace_id", ws).maybeSingle();
    return data as Item | null;
  };
  const briefOf = async (itemId: string) => {
    const { data, error } = await auth.sb.from("writer_briefs").select("*").eq("item_id", itemId).eq("workspace_id", ws).maybeSingle();
    if (error) throw new Error(NOT_RUN(error.message));
    return data as BriefRow | null;
  };
  const brandOf = async (siteId: string) => {
    const { data } = await auth.sb.from("sites").select("brand_id").eq("id", siteId).maybeSingle();
    return (data?.brand_id as string | null) ?? null;
  };

  try {
    if (action === "generate") {
      if (!process.env.ANTHROPIC_API_KEY) return fail("ANTHROPIC_API_KEY is not set on the server.", 500);
      if (!(await queueReady())) return fail("Run supabase/016_queue.sql in Supabase.", 500);
      const ids = (Array.isArray(body.itemIds) ? body.itemIds : []).map(String).slice(0, 50);
      if (!ids.length) return fail("Pick the rows to generate.", 400);
      const results: { itemId: string; ok: boolean; error?: string }[] = [];
      for (const id of ids) {
        const it = await item(id);
        if (!it) {
          results.push({ itemId: id, ok: false, error: "Topic not found." });
          continue;
        }
        const b = await briefOf(it.id);
        const { data: d } = await auth.sb.from("writer_drafts").select("status").eq("item_id", it.id).maybeSingle();
        if (b?.status === "generating" || d?.status === "generating") {
          results.push({ itemId: id, ok: true });
          continue;
        }
        if (b && (b.status === "ready" || b.status === "approved")) {
          const out = await draftFromBrief(db, b, userId);
          results.push(out.ok ? { itemId: id, ok: true } : { itemId: id, ok: false, error: out.error });
          continue;
        }
        if (!dfsReady()) {
          results.push({ itemId: id, ok: false, error: "DataForSEO is not set up. Add DFS_LOGIN and DFS_PASSWORD to the server's settings." });
          continue;
        }
        const out = await startBrief(db, { workspaceId: ws, item: it, userId, autoDraft: true });
        results.push(out.ok ? { itemId: id, ok: true } : { itemId: id, ok: false, error: out.error });
      }
      return Response.json({ results });
    }

    if (!process.env.ANTHROPIC_API_KEY && action !== "image") return fail("ANTHROPIC_API_KEY is not set on the server.", 500);
    const it = await item(body.itemId);
    if (!it) return fail("Topic not found.", 404);

    if (action === "cell") {
      const b = await briefOf(it.id);
      if (!b?.brief) return fail("This article has no brief yet. Generate it first.", 409);
      const took = await take(ws, "tasks", TASK_COST.agent);
      if (!took.ok) return took.response;
      const part = body.part === "intro" ? ({ kind: "intro" } as const) : ({ kind: "section", h2: String(body.h2 ?? "").slice(0, 300), index: Math.max(0, Number(body.index) || 0) } as const);
      const nodes = await rewritePart(db, b, part, { note: String(body.note ?? "").slice(0, 500), current: String(body.current ?? "").slice(0, 8000) });
      return Response.json({ nodes });
    }

    if (action === "image") {
      const prompt = String(body.prompt ?? "").trim().slice(0, 500);
      if (!prompt) return fail("Describe the image.", 400);
      const { data: doc } = await auth.sb.from("docs").select("id").eq("id", String(body.docId ?? "")).eq("workspace_id", ws).maybeSingle();
      if (!doc) return fail("Generate the article before adding images.", 409);
      const took = await take(ws, "tasks", TASK_COST.agent);
      if (!took.ok) return took.response;
      const img = await makeImage(db, { workspaceId: ws, docId: doc.id, siteId: it.site_id, brandId: await brandOf(it.site_id), prompt });
      return Response.json(img);
    }

    // action === "column"
    const { data: col, error: colError } = await auth.sb.from("writer_columns").select("id, kind, site_id").eq("id", String(body.columnId ?? "")).eq("workspace_id", ws).maybeSingle();
    if (colError) return fail(NOT_RUN(colError.message), 500);
    if (!col || col.kind !== "ai" || col.site_id !== it.site_id) return fail("Column not found.", 404);
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) return fail("This column has no prompt.", 400);
    const took = await take(ws, "tasks", TASK_COST.ai);
    if (!took.ok) return took.response;
    const key = { column_id: col.id, item_id: it.id };
    await db.from("writer_cells").upsert({ ...key, workspace_id: ws, status: "generating", error: null, updated_at: new Date().toISOString() });
    try {
      const value = await fillColumnCell(db, { siteId: it.site_id, brandId: await brandOf(it.site_id), prompt });
      await db.from("writer_cells").upsert({ ...key, workspace_id: ws, value, status: "ready", error: null, updated_at: new Date().toISOString() });
      return Response.json({ value });
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await db.from("writer_cells").upsert({ ...key, workspace_id: ws, status: "failed", error, updated_at: new Date().toISOString() });
      throw e;
    }
  } catch (err) {
    return fail(err instanceof Error ? NOT_RUN(err.message) : String(err), 500);
  }
}

export const POST = meteredRoute("library grid", handle);
export const maxDuration = 120;
