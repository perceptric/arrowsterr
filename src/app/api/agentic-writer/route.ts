import { dfsReady } from "@/lib/dataforseo";
import { entitlement, requireActive, requireWriter } from "@/lib/entitlements";
import { queueReady } from "@/lib/jobs";
import { periodOf } from "@/lib/plans";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { editBrief, type BriefRow } from "@/lib/writerBrief";
import { startBrief, startDraft } from "@/lib/writerServer";

// The Agentic Writer's actions (supabase/050_agentic_writer.sql). Lists and progress are read by the browser.
//   { action: "brief", itemId, note? }               Write draft: research and outline in the background; the draft
//                                                    starts on its own when the outline is done (docs/drafts-plan.md)
//   { action: "draft", briefId, note?, confirm? }    Write draft from an outline that has none yet, or Regenerate it
//                                                    (confirm: replace hand edits). A ready outline is approved first.
//   { action: "remove", itemId }                     take a topic out of the writer; its brief and draft stay
//   { action: "edit", briefId, patch }               the outline screen's edits (editBrief): headings, points, facts
//                                                    dropped, visuals and modules turned off, H1, slug and meta
const ACTIONS = ["brief", "draft", "remove", "edit"];
const fail = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ws = body.workspaceId as string;
  const auth = await requireRole(request, ws, "editor");
  if ("denied" in auth) return auth.denied;
  const action = String(body.action ?? "");
  if (!ACTIONS.includes(action)) return fail("Unknown action.", 400);
  const db = adminClient();
  if (!db) return fail("Add SUPABASE_SECRET_KEY to the server's settings.", 500);
  const { data: me } = await auth.sb.auth.getUser();
  const userId = me.user?.id ?? null;

  // Checked as the caller, so another workspace's topic or brief is not found.
  const item = async () => {
    const { data } = await auth.sb.from("calendar_items").select("id, site_id, keyword, extra").eq("id", String(body.itemId ?? "")).eq("workspace_id", ws).maybeSingle();
    return data as { id: string; site_id: string; keyword: string; extra: Record<string, unknown> | null } | null;
  };
  const brief = async () => {
    const { data, error } = await auth.sb.from("writer_briefs").select("*").eq("id", String(body.briefId ?? "")).eq("workspace_id", ws).maybeSingle();
    if (error) throw new Error(/writer_/.test(error.message) ? "Run supabase/050_agentic_writer.sql in Supabase." : error.message);
    return data as BriefRow | null;
  };

  try {
    if (action === "remove") {
      const it = await item();
      if (!it) return fail("Topic not found.", 404);
      const extra = { ...(it.extra ?? {}) };
      delete extra.in_writer_at;
      delete extra.write_queued_at;
      const { error } = await db.from("calendar_items").update({ extra }).eq("id", it.id);
      if (error) return fail(error.message, 500);
      return Response.json({ ok: true });
    }

    if (action === "edit") {
      const b = await brief();
      if (!b?.brief) return fail("Outline not found.", 404);
      if (b.status === "generating") return fail("This outline is still being written.", 409);
      const next = editBrief(b.brief, body.patch);
      const { error } = await db.from("writer_briefs").update({ brief: next, updated_at: new Date().toISOString() }).eq("id", b.id);
      if (error) return fail(error.message, 500);
      return Response.json({ ok: true, brief: next });
    }

    // Generating spends: the plan must have the writer, and the workspace must be active.
    const blocked = (await requireWriter(ws)) ?? (await requireActive(ws));
    if (blocked) return blocked;
    if (!process.env.ANTHROPIC_API_KEY) return fail("ANTHROPIC_API_KEY is not set on the server.", 500);
    if (!(await queueReady())) return fail("Run supabase/016_queue.sql in Supabase.", 500);

    if (action === "brief") {
      if (!dfsReady()) return fail("DataForSEO is not set up. Add DFS_LOGIN and DFS_PASSWORD to the server's settings.", 500);
      const it = await item();
      if (!it) return fail("Topic not found.", 404);
      const out = await startBrief(db, { workspaceId: ws, item: it, userId, note: typeof body.note === "string" ? body.note : null });
      return out.ok ? Response.json(out) : fail(out.error, out.status);
    }

    // action === "draft"
    let b = await brief();
    if (!b) return fail("Brief not found.", 404);
    // Generate Draft approves a ready brief on the way, so the draft follows the brief as it is now.
    if (b.status === "ready") {
      const { error } = await db.from("writer_briefs").update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", b.id).eq("status", "ready");
      if (error) return fail(error.message, 500);
      b = await brief();
      if (!b) return fail("Brief not found.", 404);
    }
    const e = await entitlement(ws);
    const out = await startDraft(db, {
      brief: b,
      limit: e.limits.draftsPerBrand ?? 0,
      period: periodOf("tasks", new Date(), e.anchor),
      note: typeof body.note === "string" ? body.note : null,
      confirm: body.confirm === true,
      userId,
    });
    return out.ok ? Response.json(out) : Response.json({ error: out.error, edited: out.edited ?? false, limit: out.status === 429 }, { status: out.status });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 500);
  }
}
