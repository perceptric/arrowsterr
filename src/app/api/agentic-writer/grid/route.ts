import { dfsReady } from "@/lib/dataforseo";
import { requireActive, requireWriter } from "@/lib/entitlements";
import { queueReady } from "@/lib/jobs";
import { adminClient, requireRole } from "@/lib/serverAuth";
import type { BriefRow } from "@/lib/writerBrief";
import { startBrief } from "@/lib/writerServer";

// The Library grid's action (docs/content-grid.md).
//   { action: "generate", itemIds }   Generate brief for each row. A row whose brief is ready or being written is
//                                     left alone; a failed one is tried again. Writers then fill the sections.
const ACTIONS = ["generate"];
const fail = (error: string, status: number) => Response.json({ error }, { status });
const NOT_RUN = (m: string) => (/writer_/.test(m) ? "Run supabase/050_agentic_writer.sql in Supabase." : m);

export async function POST(request: Request) {
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

    return fail("Unknown action.", 400);
  } catch (err) {
    return fail(err instanceof Error ? NOT_RUN(err.message) : String(err), 500);
  }
}

