import { dfsReady } from "@/lib/dataforseo";
import { requireActive, requireWriter } from "@/lib/entitlements";
import { queueReady } from "@/lib/jobs";
import { adminClient, requireRole } from "@/lib/serverAuth";
import type { BriefRow } from "@/lib/writerBrief";
import { startBrief } from "@/lib/writerServer";
import { brandMissing } from "@/lib/articleGrid";
import { take } from "@/lib/entitlements";
import { brandOf, generateSection } from "@/lib/gridServer";
import { meteredRoute } from "@/lib/meter";
import { TASK_COST } from "@/lib/plans";

// The Library grid's actions (docs/content-grid.md).
//   { action: "generate", itemIds }   Generate brief for each row. A row whose brief is ready or being written is
//                                     left alone; a failed one is tried again.
//   { action: "brand", itemId }       what the Brand page still needs before content can be generated: { missing }
//   { action: "section", itemId, part: "intro" | "section", h2, index, points, note, current, module }
//                                     generate one section's content (and its module); returns { nodes, moduleError }.
//                                     Refused while the brand's voice, guidelines or kit is missing.
const ACTIONS = ["generate", "brand", "section"];
const fail = (error: string, status: number) => Response.json({ error }, { status });
const NOT_RUN = (m: string) => (/writer_/.test(m) ? "Run supabase/050_agentic_writer.sql in Supabase." : m);

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
        if (b && b.status !== "failed") {
          results.push({ itemId: id, ok: true });
          continue;
        }
        if (!dfsReady()) {
          results.push({ itemId: id, ok: false, error: "DataForSEO is not set up. Add DFS_LOGIN and DFS_PASSWORD to the server's settings." });
          continue;
        }
        const out = await startBrief(db, { workspaceId: ws, item: it, userId });
        results.push(out.ok ? { itemId: id, ok: true } : { itemId: id, ok: false, error: out.error });
      }
      return Response.json({ results });
    }

    const it = await item(body.itemId);
    if (!it) return fail("Topic not found.", 404);
    const b = await briefOf(it.id);
    if (!b?.brief || (b.status !== "ready" && b.status !== "approved")) return fail("Generate the brief first.", 409);
    const missing = brandMissing(await brandOf(db, b));
    if (action === "brand") return Response.json({ missing });
    if (missing.length) return Response.json({ error: `Fill in ${missing.join(", ")} on the Brand page first.`, missing }, { status: 409 });
    if (!process.env.ANTHROPIC_API_KEY) return fail("ANTHROPIC_API_KEY is not set on the server.", 500);

    // action === "section"
    const kind = typeof body.module === "string" && body.module ? body.module : null;
    const took = await take(ws, "tasks", TASK_COST.agent + (kind ? TASK_COST.widget : 0));
    if (!took.ok) return took.response;
    const out = await generateSection(db, b, {
      part: body.part === "intro" ? { kind: "intro" } : { kind: "section", h2: String(body.h2 ?? "").slice(0, 300), index: Math.max(0, Number(body.index) || 0) },
      points: (Array.isArray(body.points) ? body.points : []).map((x: unknown) => String(x).trim().slice(0, 400)).filter(Boolean).slice(0, 12),
      note: String(body.note ?? "").slice(0, 500),
      current: String(body.current ?? "").slice(0, 8000),
      module: kind,
    });
    return Response.json(out);
  } catch (err) {
    return fail(err instanceof Error ? NOT_RUN(err.message) : String(err), 500);
  }
}

export const POST = meteredRoute("library generate", handle);
export const maxDuration = 300;
